import { CosignedV2DutchOrder } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ChainId } from '../../../lib/util/chain'
import { RpcSwapperSignatureProbe } from '../../../lib/util/SwapperSignatureProbe'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { EthCallRequest, FakeJsonRpcNode, REVERT_WITHOUT_DATA, RpcAnswer } from '../../fakes/json-rpc-node'
import { TestWallets } from '../fixtures'

// For calls left hanging; every other probe gets the production deadline.
const SHORT_PROBE_TIMEOUT_MS = 300
const DELEGATE = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
// EIP-7702 delegation designator: 0xef0100 then the delegate's address.
const DELEGATED_CODE = `0xef0100${DELEGATE.slice(2).toLowerCase()}`
const SOME_CONTRACT_CODE = '0x6080604052'
const ERC1271 = new ethers.utils.Interface(['function isValidSignature(bytes32, bytes) view returns (bytes4)'])
const encodeBytes4 = (value: string) => ethers.utils.defaultAbiCoder.encode(['bytes4'], [value])

describe('RpcSwapperSignatureProbe', () => {
  const { swapper, cosigner } = TestWallets
  let node: FakeJsonRpcNode
  let probe: RpcSwapperSignatureProbe
  let impatientProbe: RpcSwapperSignatureProbe
  let order: CosignedV2DutchOrder
  let signature: string

  beforeAll(async () => {
    order = await cosignOrder(
      SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
        swapper: swapper.address,
        cosigner: cosigner.address,
      }),
      cosigner
    )
    signature = await signOrder(order, swapper)
  })

  beforeEach(async () => {
    node = new FakeJsonRpcNode(ChainId.MAINNET)
    await node.start()
    probe = new RpcSwapperSignatureProbe({ get: () => node.provider() })
    impatientProbe = new RpcSwapperSignatureProbe({ get: () => node.provider() }, SHORT_PROBE_TIMEOUT_MS)
  })

  afterEach(async () => {
    await node.stop()
  })

  it('asks no eth_call of a swapper without code', async () => {
    await expect(probe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      swapperHasCode: false,
      erc1271Result: 'not_checked',
    })
    expect(node.methods).toEqual(['eth_getCode'])
  })

  it('asks the swapper about the Permit2 digest its own key signed, as Permit2 calls it', async () => {
    node.getCode = { result: DELEGATED_CODE }
    // A delegate that accepts exactly the swapper key's signature over the digest it is given.
    node.ethCall = (request: EthCallRequest): RpcAnswer => {
      const [digest, passed] = ERC1271.decodeFunctionData('isValidSignature', String(request.data))
      return {
        result: encodeBytes4(
          ethers.utils.recoverAddress(digest, passed) === swapper.address ? '0x1626ba7e' : '0xffffffff'
        ),
      }
    }

    await expect(probe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      swapperHasCode: true,
      delegate: DELEGATE,
      erc1271Result: 'magic',
    })
    expect(node.ethCalls).toHaveLength(1)
    expect(node.ethCalls[0].to?.toLowerCase()).toEqual(swapper.address.toLowerCase())
    expect(node.ethCalls[0].from?.toLowerCase()).toEqual(
      String(order.permitData().domain.verifyingContract).toLowerCase()
    )
  })

  it.each<[string, string, RpcAnswer]>([
    ['returns nothing', 'empty', { result: '0x' }],
    ['reverts without data', 'reverted', REVERT_WITHOUT_DATA],
    ['answers another value', 'rejected', { result: encodeBytes4('0xffffffff') }],
    // ethers v5 hands back a revert's data as the call's result
    ['reverts with data', 'rejected', { error: { code: 3, message: 'execution reverted', data: '0xdeadbeef' } }],
  ])('reports a swapper with code that %s as %s', async (_, erc1271Result, answer) => {
    node.getCode = { result: DELEGATED_CODE }
    node.ethCall = answer

    await expect(probe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      swapperHasCode: true,
      delegate: DELEGATE,
      erc1271Result,
    })
  })

  it('reports no delegate for code that is not an EIP-7702 designator', async () => {
    node.getCode = { result: SOME_CONTRACT_CODE }
    node.ethCall = { result: '0x' }

    await expect(probe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      swapperHasCode: true,
      delegate: undefined,
      erc1271Result: 'empty',
    })
  })

  it.each<[string, RpcAnswer]>([
    ['hangs past the deadline', 'hang'],
    ['answers a JSON-RPC error that is not a revert', { error: { code: -32005, message: 'limit exceeded' } }],
  ])('never reports a rejection when eth_call %s', async (_, answer) => {
    node.getCode = { result: DELEGATED_CODE }
    node.ethCall = answer

    await expect(impatientProbe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      swapperHasCode: true,
      delegate: DELEGATE,
      erc1271Result: 'not_checked',
    })
  })

  it('reports not_checked, asking no eth_call, for a signature it cannot even encode', async () => {
    node.getCode = { result: DELEGATED_CODE }

    await expect(probe.probe(ChainId.MAINNET, order, '0x123')).resolves.toEqual({
      swapperHasCode: true,
      delegate: DELEGATE,
      erc1271Result: 'not_checked',
    })
    expect(node.ethCalls).toEqual([])
  })

  it('leaves swapperHasCode unset when eth_getCode fails', async () => {
    node.getCode = 'hang'

    await expect(impatientProbe.probe(ChainId.MAINNET, order, signature)).resolves.toEqual({
      erc1271Result: 'not_checked',
    })
    expect(node.ethCalls).toEqual([])
  })
})
