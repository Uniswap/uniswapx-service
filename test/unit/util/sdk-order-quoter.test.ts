import { CosignedV2DutchOrder, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { FakeJsonRpcNode } from '../../fakes/json-rpc-node'
import { TestWallets } from '../fixtures'

// Permit2 SignatureVerification.InvalidContractSignature(): an ERC-1271 swapper rejected the signature.
const INVALID_CONTRACT_SIGNATURE = ethers.utils.id('InvalidContractSignature()').slice(0, 10)

// What the SDK's multicall gets back from eth_call: Multicall2.tryAggregate's (success, returnData)[]
// for the one quoted order.
const tryAggregateResult = (success: boolean, returnData: string) =>
  ethers.utils.defaultAbiCoder.encode(['tuple(bool success, bytes returnData)[]'], [[[success, returnData]]])

// The real uniswapx-sdk OrderValidator over a real ethers provider; only the node's answers are scripted.
// These pin the SDK behaviour OrderPoster's UnknownError handling relies on.
describe('uniswapx-sdk OrderValidator.quote', () => {
  const { swapper, cosigner } = TestWallets
  let node: FakeJsonRpcNode
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
  })

  afterEach(async () => {
    await node.stop()
  })

  const quote = () => new OrderValidator(node.provider(), ChainId.MAINNET).quote({ order, signature })

  it('reports a quote that reverted without data as UnknownError with validationErrorData 0x', async () => {
    node.ethCall = { result: tryAggregateResult(false, '0x') }

    const result = await quote()

    expect(result.validation).toBe(OrderValidation.UnknownError)
    expect(result.validationErrorData).toBe('0x')
    expect(node.methods).toContain('eth_call')
  })

  it('maps InvalidContractSignature to InvalidSignature and keeps the revert data', async () => {
    node.ethCall = { result: tryAggregateResult(false, INVALID_CONTRACT_SIGNATURE) }

    const result = await quote()

    expect(INVALID_CONTRACT_SIGNATURE).toBe('0xb0669cbc')
    expect(result.validation).toBe(OrderValidation.InvalidSignature)
    expect(result.validationErrorData).toBe(INVALID_CONTRACT_SIGNATURE)
  })
})
