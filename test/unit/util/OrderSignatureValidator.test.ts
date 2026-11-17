import { CosignedV2DutchOrder, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import {
  ERC1271_MAGIC_VALUE,
  isNodeRevert,
  OrderSignatureValidator,
  SignatureCheckProvider,
} from '../../../lib/util/OrderSignatureValidator'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { FakeJsonRpcNode, REVERT_WITHOUT_DATA, RpcAnswer } from '../../fakes/json-rpc-node'
import { TestWallets, Tokens, ZERO_SIGNATURE } from '../fixtures'

const SOME_CONTRACT_CODE = '0x6080604052'

// An account without code: the swapper check ecrecovers and asks nothing else.
class EoaProvider implements SignatureCheckProvider {
  public readonly codeLookups: string[] = []

  async getCode(address: string): Promise<string> {
    this.codeLookups.push(address)
    return '0x'
  }

  async send(method: string): Promise<never> {
    throw new Error(`unexpected ${method}`)
  }
}

const eoaProvider = () => new EoaProvider()
const encodeMagic = (value: string) => ethers.utils.defaultAbiCoder.encode(['bytes4'], [value])
// the same r and s with v rewritten: ecrecover onchain yields address(0) for v outside 27/28
const withV = (signature: string, v: number) =>
  ethers.utils.hexConcat([ethers.utils.hexDataSlice(signature, 0, 64), [v]])

describe('OrderSignatureValidator', () => {
  const { swapper, cosigner, stranger } = TestWallets

  const buildV2 = (overrides: { cosigner?: string } = {}) =>
    SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
      swapper: swapper.address,
      cosigner: overrides.cosigner ?? cosigner.address,
      input: { token: Tokens.MAINNET.BUIDL, startAmount: '1000000', endAmount: '1000000' },
    })

  let order: CosignedV2DutchOrder
  let signature: string

  beforeAll(async () => {
    order = await cosignOrder(buildV2(), cosigner)
    signature = await signOrder(order, swapper)
  })

  describe('swapper signature', () => {
    it('accepts the swapper signature of a cosigned V2 order', async () => {
      await expect(new OrderSignatureValidator(eoaProvider()).validate(order, signature)).resolves.toBe(
        OrderValidation.OK
      )
    })

    it('accepts an EIP-2098 compact signature, as Permit2 does', async () => {
      const compact = ethers.utils.splitSignature(signature).compact
      await expect(new OrderSignatureValidator(eoaProvider()).validate(order, compact)).resolves.toBe(
        OrderValidation.OK
      )
    })

    it('rejects a zeroed signature', async () => {
      await expect(new OrderSignatureValidator(eoaProvider()).validate(order, ZERO_SIGNATURE)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })

    it("rejects another wallet's signature over the same order", async () => {
      const forged = await signOrder(order, stranger)
      await expect(new OrderSignatureValidator(eoaProvider()).validate(order, forged)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })

    it('rejects a 65-byte signature whose v is not 27 or 28, which ecrecover onchain would too', async () => {
      const { v } = ethers.utils.splitSignature(signature)
      for (const badV of [v - 27, v + 2]) {
        await expect(new OrderSignatureValidator(eoaProvider()).validate(order, withV(signature, badV))).resolves.toBe(
          OrderValidation.InvalidSignature
        )
      }
    })

    it('accepts a V1 Dutch order signed by its swapper', async () => {
      const v1 = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, { swapper: swapper.address })
      await expect(new OrderSignatureValidator(eoaProvider()).validate(v1, await signOrder(v1, swapper))).resolves.toBe(
        OrderValidation.OK
      )
      await expect(new OrderSignatureValidator(eoaProvider()).validate(v1, signature)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })
  })

  // A real provider against a local node, so results, reverts and failures reach the validator
  // as they do in production.
  describe('contract-wallet swapper (ERC-1271)', () => {
    let node: FakeJsonRpcNode

    beforeEach(async () => {
      node = new FakeJsonRpcNode(ChainId.MAINNET)
      await node.start()
      node.getCode = { result: SOME_CONTRACT_CODE }
    })

    afterEach(async () => {
      await node.stop()
    })

    const validate = (swapperSignature: string) =>
      new OrderSignatureValidator(node.provider()).validate(order, swapperSignature)

    it('asks the swapper contract about the Permit2 digest and accepts the magic value', async () => {
      node.ethCall = { result: encodeMagic(ERC1271_MAGIC_VALUE) }
      await expect(validate(ZERO_SIGNATURE)).resolves.toBe(OrderValidation.OK)

      expect(node.methods).toEqual(['eth_getCode', 'eth_call'])
      expect(node.ethCalls).toHaveLength(1)
      expect(node.ethCalls[0].to).toEqual(swapper.address)
      expect(node.ethCalls[0].from).toBeUndefined()
      const erc1271 = new ethers.utils.Interface(['function isValidSignature(bytes32, bytes) view returns (bytes4)'])
      const [digest, passedSignature] = erc1271.decodeFunctionData('isValidSignature', String(node.ethCalls[0].data))
      expect(passedSignature).toEqual(ZERO_SIGNATURE)
      // the digest is the one the swapper's EOA signature is over, i.e. what Permit2 hashes onchain
      expect(ethers.utils.recoverAddress(digest, signature)).toEqual(swapper.address)
    })

    it('rejects any other return value', async () => {
      node.ethCall = { result: encodeMagic('0xffffffff') }
      await expect(validate(signature)).resolves.toBe(OrderValidation.InvalidSignature)
    })

    it('rejects when the contract reverts', async () => {
      node.ethCall = REVERT_WITHOUT_DATA
      await expect(validate(signature)).resolves.toBe(OrderValidation.InvalidSignature)
    })

    it('rejects a revert whatever data it carries, the magic value included', async () => {
      for (const data of [encodeMagic(ERC1271_MAGIC_VALUE), encodeMagic('0xffffffff'), '0x']) {
        node.ethCall = { error: { code: 3, message: 'execution reverted', data } }
        await expect(validate(signature)).resolves.toBe(OrderValidation.InvalidSignature)
      }
    })

    it('does not fall back to ecrecover for an account with code', async () => {
      node.ethCall = { result: '0x' }
      await expect(validate(signature)).resolves.toBe(OrderValidation.InvalidSignature)
    })

    it.each<[string, RpcAnswer]>([
      ['a rate limit', { error: { code: -32005, message: 'rate limited' } }],
      ['an internal error', { error: { code: -32603, message: 'internal error' } }],
      ['an HTTP error', { httpStatus: 502 }],
    ])('propagates an RPC failure instead of reporting the signature invalid: %s', async (_name, failure) => {
      node.ethCall = failure
      await expect(validate(signature)).rejects.toMatchObject({ code: ethers.errors.SERVER_ERROR })
      expect(node.methods).toEqual(['eth_getCode', 'eth_call'])
    })

    it('propagates a call the node never answers', async () => {
      node.ethCall = 'hang'
      const provider = new ethers.providers.StaticJsonRpcProvider(
        { url: node.provider().connection.url, timeout: 50 },
        ChainId.MAINNET
      )
      await expect(new OrderSignatureValidator(provider).validate(order, signature)).rejects.toMatchObject({
        code: ethers.errors.TIMEOUT,
      })
    })

    // ethers' own wording for a call it got no result for says "reverted" as well. It is ethers',
    // not the node's, so on its own it is not a revert.
    it("does not take ethers' own 'reverted' wording for the node's", () => {
      const logger = new ethers.utils.Logger('test')
      const callException = (cause: Error) =>
        logger.makeError(
          'missing revert data in call exception; Transaction reverted without a reason string',
          ethers.errors.CALL_EXCEPTION,
          { error: cause }
        )
      expect(isNodeRevert(callException(logger.makeError('timeout', ethers.errors.TIMEOUT)))).toBe(false)
      expect(isNodeRevert(callException(Object.assign(new Error('execution reverted'), { code: -32000 })))).toBe(true)
    })

    it('propagates a failed code lookup', async () => {
      node.getCode = { httpStatus: 502 }
      await expect(validate(signature)).rejects.toMatchObject({ code: ethers.errors.SERVER_ERROR })
      expect(node.methods).toEqual(['eth_getCode'])
    })
  })

  describe('cosignature', () => {
    it('rejects an empty cosignature before any RPC call', async () => {
      const provider = eoaProvider()
      const uncosigned = buildV2()
      await expect(
        new OrderSignatureValidator(provider).validate(uncosigned, await signOrder(uncosigned, swapper))
      ).resolves.toBe(OrderValidation.InvalidCosignature)
      expect(provider.codeLookups).toEqual([])
    })

    it("rejects a cosignature from a key other than the order's cosigner", async () => {
      const miscosigned = await cosignOrder(buildV2(), stranger)
      await expect(
        new OrderSignatureValidator(eoaProvider()).validate(miscosigned, await signOrder(miscosigned, swapper))
      ).resolves.toBe(OrderValidation.InvalidCosignature)
    })

    it('rejects an EIP-191 (personal_sign) cosignature, which the reactor would also reject', async () => {
      const unsigned = buildV2()
      const cosignature = await cosigner.signMessage(unsigned.cosignatureHash(unsigned.info.cosignerData))
      const prefixed = new CosignedV2DutchOrder({ ...unsigned.info, cosignature }, ChainId.MAINNET)
      await expect(
        new OrderSignatureValidator(eoaProvider()).validate(prefixed, await signOrder(prefixed, swapper))
      ).resolves.toBe(OrderValidation.InvalidCosignature)
    })

    it('rejects a compact or non-27/28-v cosignature, which CosignerLib would also reject', async () => {
      const { v, compact } = ethers.utils.splitSignature(order.info.cosignature)
      for (const cosignature of [compact, withV(order.info.cosignature, v - 27)]) {
        const malformed = new CosignedV2DutchOrder({ ...order.info, cosignature }, ChainId.MAINNET)
        await expect(new OrderSignatureValidator(eoaProvider()).validate(malformed, signature)).resolves.toBe(
          OrderValidation.InvalidCosignature
        )
      }
    })
  })
})
