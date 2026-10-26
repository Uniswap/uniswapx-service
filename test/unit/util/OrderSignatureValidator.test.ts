import { CosignedV2DutchOrder, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import {
  ERC1271_MAGIC_VALUE,
  OrderSignatureValidator,
  SignatureCheckProvider,
} from '../../../lib/util/OrderSignatureValidator'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { TestWallets, Tokens, ZERO_SIGNATURE } from '../fixtures'

const SOME_CONTRACT_CODE = '0x6080604052'
const ethersError = (message: string, code: ethers.errors) => new ethers.utils.Logger('test').makeError(message, code)

type CallRequest = Parameters<ethers.providers.Provider['call']>[0]

class FakeProvider implements SignatureCheckProvider {
  public readonly codeLookups: string[] = []
  public readonly calls: CallRequest[] = []

  constructor(private readonly code: string, private readonly callResult: string | Error = '0x') {}

  async getCode(address: string): Promise<string> {
    this.codeLookups.push(address)
    return this.code
  }

  async call(transaction: CallRequest): Promise<string> {
    this.calls.push(transaction)
    if (this.callResult instanceof Error) {
      throw this.callResult
    }
    return this.callResult
  }
}

const eoaProvider = () => new FakeProvider('0x')
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

  describe('contract-wallet swapper (ERC-1271)', () => {
    it('asks the swapper contract about the Permit2 digest and accepts the magic value', async () => {
      const provider = new FakeProvider(SOME_CONTRACT_CODE, encodeMagic(ERC1271_MAGIC_VALUE))
      await expect(new OrderSignatureValidator(provider).validate(order, ZERO_SIGNATURE)).resolves.toBe(
        OrderValidation.OK
      )

      expect(provider.codeLookups).toEqual([swapper.address])
      expect(provider.calls).toHaveLength(1)
      expect(provider.calls[0].to).toEqual(swapper.address)
      const erc1271 = new ethers.utils.Interface(['function isValidSignature(bytes32, bytes) view returns (bytes4)'])
      const [digest, passedSignature] = erc1271.decodeFunctionData('isValidSignature', String(provider.calls[0].data))
      expect(passedSignature).toEqual(ZERO_SIGNATURE)
      // the digest is the one the swapper's EOA signature is over, i.e. what Permit2 hashes onchain
      expect(ethers.utils.recoverAddress(digest, signature)).toEqual(swapper.address)
    })

    it('rejects any other return value', async () => {
      const provider = new FakeProvider(SOME_CONTRACT_CODE, encodeMagic('0xffffffff'))
      await expect(new OrderSignatureValidator(provider).validate(order, signature)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })

    it('rejects when the contract reverts', async () => {
      const provider = new FakeProvider(
        SOME_CONTRACT_CODE,
        ethersError('execution reverted', ethers.errors.CALL_EXCEPTION)
      )
      await expect(new OrderSignatureValidator(provider).validate(order, signature)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })

    it('does not fall back to ecrecover for an account with code', async () => {
      const provider = new FakeProvider(SOME_CONTRACT_CODE, '0x')
      await expect(new OrderSignatureValidator(provider).validate(order, signature)).resolves.toBe(
        OrderValidation.InvalidSignature
      )
    })

    it('propagates an RPC failure instead of reporting the signature invalid', async () => {
      const provider = new FakeProvider(SOME_CONTRACT_CODE, ethersError('timeout', ethers.errors.TIMEOUT))
      await expect(new OrderSignatureValidator(provider).validate(order, signature)).rejects.toThrow('timeout')
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
