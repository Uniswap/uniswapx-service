import { Logger } from '@aws-lambda-powertools/logger'
import { ExecutionAlreadyExists } from '@aws-sdk/client-sfn'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import {
  CosignedV2DutchOrder,
  OrderType,
  OrderValidation,
  PermissionedTokenValidator,
  CosignedPriorityOrder as SDKPriorityOrder,
} from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { BigNumber, constants } from 'ethers'
import { mock } from 'jest-mock-extended'
import { OrderValidationFailedError } from '../../../lib/errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../../lib/errors/TooManyOpenOrdersError'
import { PRIORITY_ORDER_TARGET_BLOCK_BUFFER } from '../../../lib/handlers/constants'
import { ProviderMap } from '../../../lib/handlers/shared'
import * as sfn from '../../../lib/handlers/shared/sfn'
import { DutchV2Order } from '../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { PriorityOrder } from '../../../lib/models/PriorityOrder'
import { ChainId } from '../../../lib/util/chain'
import { metrics } from '../../../lib/util/metrics'
import { Permit2Validator } from '../../../lib/util/Permit2Validator'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../factories/SDKPriorityOrderFactory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { RecordingAnalytics } from '../../fakes/analytics'
import { FakeOffChainValidator } from '../../fakes/order-validators'
import { SilentServer, silentServerClientOptions } from '../../fakes/silent-server'
import { makePostOrderService } from '../builders/post-path'
import { TestWallets, Tokens, ZERO_SIGNATURE } from '../fixtures'

jest.mock('../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

jest.mock('../../../lib/preconditions/preconditions', () => {
  return { checkDefined: jest.fn().mockImplementation((value) => value) }
})

// The service rebuilds the state machine ARN from these (see
// lib/util/stateMachineArn.ts). checkDefined is mocked to a pass-through
// above, so an unset STATE_MACHINE_NAMES would surface as a JSON.parse
// failure swallowed by createOrder's catch rather than a clear error.
const MOCK_SM_ARN_1 = 'arn:aws:states:region:123456789012:stateMachine:MOCK_SM_1'

describe('OrderPoster', () => {
  beforeAll(() => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({ 1: 'MOCK_SM_1' })
    process.env['ACCOUNT_ID'] = '123456789012'
    process.env['REGION'] = 'region'
  })

  test('createOrder with LimitOrder, propagates correct type', async () => {
    const { service, orderValidator, onChainValidator, repository, analytics, tracking } = makePostOrderService({
      getMaxOpenOrders: () => 10,
    })

    const order = SDKDutchOrderFactory.buildLimitOrder()

    const response = await service.createOrder(new LimitOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(orderValidator.calls).toHaveLength(1)
    expect(onChainValidator.calls).toHaveLength(1)
    expect(repository.countCalls).toHaveLength(1)
    expect(repository.puts).toHaveLength(1)
    expect(analytics.posted).toEqual([{ order: expect.anything(), orderType: OrderType.Limit }])
    expect(tracking.calls).toEqual([
      {
        input: {
          chainId: 1,
          orderHash: response,
          orderStatus: 'open',
          orderType: 'Limit',
          quoteId: '',
          runIndex: 0,
          stateMachineArn: MOCK_SM_ARN_1,
        },
        stateMachineArn: MOCK_SM_ARN_1,
      },
    ])
  })

  test('createOrder returns the order hash when post-persist tracking kickoff fails', async () => {
    const logger = mock<Logger>()
    const { service, repository, tracking } = makePostOrderService({ logger, getMaxOpenOrders: () => 10 })

    const order = SDKDutchOrderFactory.buildLimitOrder()
    tracking.failNextWith(new Error('sfn unavailable'))

    // The order is persisted before tracking starts; the caller must still
    // receive the hash or an accepted order is misreported as rejected.
    const response = await service.createOrder(new LimitOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(repository.puts).toHaveLength(1)
    expect(logger.error).toHaveBeenCalledWith(
      'Post-persist processing failed for accepted order',
      expect.objectContaining({ orderHash: response })
    )
  })

  test('createOrder counts a started tracker', async () => {
    const putMetric = jest.spyOn(metrics, 'putMetric')
    try {
      const { service, tracking } = makePostOrderService({ getMaxOpenOrders: () => 10 })

      await service.createOrder(new LimitOrder(SDKDutchOrderFactory.buildLimitOrder(), '0x00', 1))

      expect(tracking.calls).toHaveLength(1)
      expect(putMetric).toHaveBeenCalledWith('OrderTrackerStarted', 1, Unit.Count)
      expect(putMetric).not.toHaveBeenCalledWith('PostOrderPostPersistFailure', 1, Unit.Count)
    } finally {
      putMetric.mockRestore()
    }
  })

  test('createOrder counts a tracker that already exists as a re-post, not a post-persist failure', async () => {
    const putMetric = jest.spyOn(metrics, 'putMetric')
    try {
      const logger = mock<Logger>()
      const { service, repository, tracking } = makePostOrderService({ logger, getMaxOpenOrders: () => 10 })
      tracking.failNextWith(new ExecutionAlreadyExists({ message: 'Execution Already Exists', $metadata: {} }))

      const response = await service.createOrder(new LimitOrder(SDKDutchOrderFactory.buildLimitOrder(), '0x00', 1))

      expect(response).toMatch(/^0x[0-9a-f]{64}$/)
      expect(repository.puts).toHaveLength(1)
      expect(logger.warn).toHaveBeenCalledWith('Order tracker already exists for re-posted order', {
        orderHash: response,
      })
      expect(logger.error).not.toHaveBeenCalled()
      expect(putMetric).toHaveBeenCalledWith('PostOrderTrackerAlreadyExists', 1, Unit.Count)
      expect(putMetric).not.toHaveBeenCalledWith('PostOrderPostPersistFailure', 1, Unit.Count)
      expect(putMetric).not.toHaveBeenCalledWith('OrderTrackerStarted', 1, Unit.Count)
    } finally {
      putMetric.mockRestore()
    }
  })

  test('createOrder still starts tracking when the OrderPosted analytics log throws', async () => {
    const logger = mock<Logger>()
    const analytics = new RecordingAnalytics()
    jest.spyOn(analytics, 'logOrderPosted').mockImplementation(() => {
      throw new Error('bad amount')
    })
    const { service, repository, tracking } = makePostOrderService({ logger, analytics, getMaxOpenOrders: () => 10 })

    const response = await service.createOrder(new LimitOrder(SDKDutchOrderFactory.buildLimitOrder(), '0x00', 1))

    expect(repository.puts).toHaveLength(1)
    expect(tracking.calls).toHaveLength(1)
    expect(logger.error).toHaveBeenCalledWith('Failed to log OrderPosted', {
      orderHash: response,
      err: expect.objectContaining({ message: 'bad amount' }),
    })
    expect(logger.error).not.toHaveBeenCalledWith(
      'Post-persist processing failed for accepted order',
      expect.anything()
    )
  })

  test('createOrder returns the order hash when the tracking kickoff hangs until the SFN client times out', async () => {
    // The module is mocked above; run the real kickoff over a real client whose StartExecution
    // goes to a server that never answers, so the timeout comes from the HTTP handler.
    const actualSfn = jest.requireActual<typeof sfn>('../../../lib/handlers/shared/sfn')
    const server = new SilentServer()
    await server.start()
    const client = actualSfn.createSfnClient({
      ...silentServerClientOptions(server),
      requestTimeoutMs: 200,
      attempts: 2,
    })
    const putMetric = jest.spyOn(metrics, 'putMetric')
    try {
      const logger = mock<Logger>()
      const { service, repository } = makePostOrderService({ logger, getMaxOpenOrders: () => 10 })
      jest
        .mocked(sfn.kickoffOrderTrackingSfn)
        .mockImplementation((input, stateMachineArn) =>
          actualSfn.kickoffOrderTrackingSfn(input, stateMachineArn, client)
        )

      const response = await service.createOrder(new LimitOrder(SDKDutchOrderFactory.buildLimitOrder(), '0x00', 1))

      expect(response).toMatch(/^0x[0-9a-f]{64}$/)
      expect(repository.puts).toHaveLength(1)
      expect(server.connections).toBe(2)
      expect(logger.error).toHaveBeenCalledWith('Post-persist processing failed for accepted order', {
        orderHash: response,
        err: expect.objectContaining({ name: 'TimeoutError' }),
      })
      expect(putMetric).toHaveBeenCalledWith('PostOrderPostPersistFailure', 1, Unit.Count)
    } finally {
      putMetric.mockRestore()
      client.destroy()
      await server.stop()
    }
  })

  test('createOrder throws TooManyOpenOrdersError and does not persist when open order limit is reached', async () => {
    const { service, repository } = makePostOrderService({ getMaxOpenOrders: () => 10 })
    repository.openOrderCount = 11

    const order = SDKDutchOrderFactory.buildLimitOrder()

    await expect(service.createOrder(new LimitOrder(order, '0x00', 1))).rejects.toThrow(TooManyOpenOrdersError)
    expect(repository.puts).toEqual([])
  })

  test('createOrder with PriorityOrder, propagates correct type', async () => {
    const { service, orderValidator, onChainValidator, repository, analytics, tracking } = makePostOrderService({
      getMaxOpenOrders: () => 10,
    })

    const order = SDKPriorityOrderFactory.buildPriorityOrder()

    const response = await service.createOrder(new PriorityOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(orderValidator.calls).toHaveLength(1)
    expect(onChainValidator.calls).toHaveLength(1)
    expect(repository.countCalls).toHaveLength(1)
    expect(repository.puts).toHaveLength(1)
    expect(analytics.posted).toEqual([{ order: expect.anything(), orderType: OrderType.Priority }])
    expect(tracking.calls).toEqual([
      {
        input: {
          chainId: 1,
          orderHash: response,
          orderStatus: 'open',
          orderType: 'Priority',
          quoteId: '',
          runIndex: 0,
          stateMachineArn: MOCK_SM_ARN_1,
        },
        stateMachineArn: MOCK_SM_ARN_1,
      },
    ])
  })

  test('createOrder with PriorityOrder rejects stale order when auctionTargetBlock > auctionStartBlock', async () => {
    const { service, orderValidator, repository } = makePostOrderService({ getMaxOpenOrders: () => 10 })

    // Create a priority order with a very low auctionStartBlock (block 1)
    // When reparameterizeAndCosign runs, it will set auctionTargetBlock to current block + buffer (~103)
    // This creates a stale order scenario where auctionTargetBlock > auctionStartBlock
    const baseOrder = SDKPriorityOrderFactory.buildPriorityOrder(ChainId.MAINNET)
    // Manually set auctionStartBlock to a very low value after creation
    // This simulates a stale order where the start block is in the past
    baseOrder.info.auctionStartBlock = BigNumber.from(1)
    const priorityOrder = new PriorityOrder(baseOrder, '0x00', ChainId.MAINNET)

    await expect(service.createOrder(priorityOrder)).rejects.toThrow(
      new OrderValidationFailedError('auctionStartBlock too low')
    )

    // The off-chain checks run before cosigning; persistence never does.
    expect(orderValidator.calls).toHaveLength(1)
    expect(repository.puts).toEqual([])
  })

  describe('createOrder with a PriorityOrder: what runs before the block fetch and the cosignature', () => {
    const MAINNET_TARGET_BLOCK_BUFFER = 3

    // A provider whose latest block is `number`, minted now so no extra target block is added.
    function chainAt(number: number) {
      const getBlock = jest.fn(async () => ({ number, timestamp: Math.floor(Date.now() / 1000) }))
      const providerMap: ProviderMap = { get: () => ({ getBlock } as unknown as StaticJsonRpcProvider) }
      return { getBlock, providerMap }
    }

    function priorityOrderStartingAt(auctionStartBlock: BigNumber | number, chainId = ChainId.MAINNET) {
      const order = SDKPriorityOrderFactory.buildPriorityOrder(ChainId.MAINNET, {
        auctionStartBlock: auctionStartBlock.toString(),
        // the builder wants a target at or before the start; the service replaces it
        cosignerData: { auctionTargetBlock: '1' },
      })
      // As the post handler parses it: the request's chainId, whatever the bytes were built for.
      return new PriorityOrder(SDKPriorityOrder.parse(order.serialize(), chainId), '0x00', chainId)
    }

    // The handler answers OrderValidationFailedError with a 400; any other error is a 500.
    async function expectValidationFailure(createOrder: Promise<string>, message: string) {
      const error = await createOrder.then(
        () => undefined,
        (e: unknown) => e
      )
      expect(error).toBeInstanceOf(OrderValidationFailedError)
      expect((error as Error).message).toBe(message)
    }

    test('rejects a single-digit start block against a block in the tens of millions', async () => {
      // As decimal strings, "30000003" > "9" is false.
      const { getBlock, providerMap } = chainAt(30_000_000)
      const { service, cosigner, repository } = makePostOrderService({ providerMap })

      await expectValidationFailure(service.createOrder(priorityOrderStartingAt(9)), 'auctionStartBlock too low')

      expect(getBlock).toHaveBeenCalledTimes(1)
      expect(cosigner.digests).toHaveLength(1)
      expect(repository.puts).toEqual([])
    })

    test('accepts a start block with more digits than the target block', async () => {
      // As decimal strings, "99999993" > "100000000" is true.
      const { providerMap } = chainAt(99_999_990)
      const { service, repository } = makePostOrderService({ providerMap })

      await service.createOrder(priorityOrderStartingAt(100_000_000))

      expect(repository.puts).toHaveLength(1)
      expect(repository.puts[0]).toMatchObject({
        auctionStartBlock: 100_000_000,
        cosignerData: { auctionTargetBlock: 99_999_990 + MAINNET_TARGET_BLOCK_BUFFER },
      })
    })

    test('accepts the target block itself as the start block', async () => {
      const { providerMap } = chainAt(1_000)
      const { service, repository } = makePostOrderService({ providerMap })

      await service.createOrder(priorityOrderStartingAt(1_000 + MAINNET_TARGET_BLOCK_BUFFER))

      expect(repository.puts).toHaveLength(1)
    })

    test('rejects a start block above Number.MAX_SAFE_INTEGER before fetching a block', async () => {
      const { getBlock, providerMap } = chainAt(30_000_000)
      const { service, cosigner, onChainValidator, repository } = makePostOrderService({ providerMap })

      await expectValidationFailure(
        service.createOrder(priorityOrderStartingAt(BigNumber.from(2).pow(53).add(1))),
        'Invalid auctionStartBlock: must be at most 9007199254740991'
      )

      expect(getBlock).not.toHaveBeenCalled()
      expect(cosigner.digests).toEqual([])
      expect(onChainValidator.calls).toEqual([])
      expect(repository.puts).toEqual([])
    })

    test('accepts a start block of exactly Number.MAX_SAFE_INTEGER', async () => {
      const { providerMap } = chainAt(30_000_000)
      const { service, repository } = makePostOrderService({ providerMap })

      await service.createOrder(priorityOrderStartingAt(Number.MAX_SAFE_INTEGER))

      expect(repository.puts).toHaveLength(1)
      expect(repository.puts[0]).toMatchObject({ auctionStartBlock: Number.MAX_SAFE_INTEGER })
    })

    test('rejects a chain with no target-block buffer at the reactor check, before fetching a block', async () => {
      const { getBlock, providerMap } = chainAt(30_000_000)
      const nowSeconds = Math.floor(Date.now() / 1000)
      const orderValidator = new FakeOffChainValidator({
        getCurrentTime: () => nowSeconds,
        deadlineValidityPeriodSeconds: 60,
        cosigner: constants.AddressZero,
        priorityCosigner: constants.AddressZero,
      })
      const { service, cosigner } = makePostOrderService({ providerMap, orderValidator })
      expect(PRIORITY_ORDER_TARGET_BLOCK_BUFFER[ChainId.BNB]).toBeUndefined()

      await expectValidationFailure(
        service.createOrder(priorityOrderStartingAt(30_000_010, ChainId.BNB)),
        'Invalid reactor address'
      )

      expect(getBlock).not.toHaveBeenCalled()
      expect(cosigner.digests).toEqual([])
    })

    test('answers 400, not 500, for a chain past the off-chain checks with no target-block buffer', async () => {
      const { getBlock, providerMap } = chainAt(30_000_000)
      const { service, cosigner } = makePostOrderService({ providerMap })

      await expectValidationFailure(
        service.createOrder(priorityOrderStartingAt(30_000_010, ChainId.BNB)),
        'Priority orders are not supported on chainId 56'
      )

      expect(getBlock).not.toHaveBeenCalled()
      expect(cosigner.digests).toEqual([])
    })

    test('an order the off-chain checks reject costs no block fetch and no cosignature', async () => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      try {
        const { getBlock, providerMap } = chainAt(30_000_000)
        const { service, orderValidator, onChainValidator, cosigner } = makePostOrderService({ providerMap })
        orderValidator.result = { valid: false, errorString: 'Invalid priority order cosigner: nope' }

        // Its start block is also too low; the off-chain answer comes first.
        await expectValidationFailure(
          service.createOrder(priorityOrderStartingAt(9)),
          'Invalid priority order cosigner: nope'
        )

        expect(getBlock).not.toHaveBeenCalled()
        expect(cosigner.digests).toEqual([])
        expect(onChainValidator.calls).toEqual([])
        expect(putMetric).toHaveBeenCalledWith('OffchainValidationFailure', 1, Unit.Count)
      } finally {
        putMetric.mockRestore()
      }
    })

    test('an order the order quoter rejects costs exactly one block fetch and one cosignature', async () => {
      const { getBlock, providerMap } = chainAt(30_000_000)
      const { service, orderValidator, onChainValidator, cosigner, repository } = makePostOrderService({
        providerMap,
      })
      onChainValidator.result = OrderValidation.ValidationFailed

      await expectValidationFailure(
        service.createOrder(priorityOrderStartingAt(30_000_010)),
        'Onchain validation failed: ValidationFailed'
      )

      expect(getBlock).toHaveBeenCalledTimes(1)
      expect(cosigner.digests).toHaveLength(1)
      expect(orderValidator.calls).toHaveLength(1)
      // The quoter sees the cosigned order.
      expect(onChainValidator.calls).toHaveLength(1)
      expect(
        (onChainValidator.calls[0].order as SDKPriorityOrder).info.cosignerData.auctionTargetBlock.toNumber()
      ).toBe(30_000_000 + MAINNET_TARGET_BLOCK_BUFFER)
      expect(repository.puts).toEqual([])
    })
  })

  describe('permissioned input tokens', () => {
    // the real isPermissionedToken routes mainnet BUIDL orders away from the order quoter
    const { swapper, cosigner } = TestWallets

    let preTransferCheck: jest.SpyInstance
    let permit2Validate: jest.SpyInstance
    let order: CosignedV2DutchOrder
    let signature: string

    const buildPermissionedOrder = (overrides: { swapper?: string } = {}) =>
      SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
        swapper: overrides.swapper ?? swapper.address,
        cosigner: cosigner.address,
        input: { token: Tokens.MAINNET.BUIDL, startAmount: '1000000', endAmount: '1000000' },
      })

    beforeAll(async () => {
      order = await cosignOrder(buildPermissionedOrder(), cosigner)
      signature = await signOrder(order, swapper)
    })

    beforeEach(() => {
      preTransferCheck = jest.spyOn(PermissionedTokenValidator, 'preTransferCheck').mockResolvedValue(true)
      permit2Validate = jest.spyOn(Permit2Validator.prototype, 'validate').mockResolvedValue(OrderValidation.OK)
    })

    afterEach(() => {
      preTransferCheck.mockRestore()
      permit2Validate.mockRestore()
    })

    test('stores an order whose swapper signature and cosignature verify, without the order quoter', async () => {
      const { service, repository, onChainValidator } = makePostOrderService()

      await service.createOrder(new DutchV2Order(order, signature, ChainId.MAINNET))

      expect(repository.puts).toEqual([expect.objectContaining({ orderHash: order.hash().toLowerCase(), signature })])
      expect(onChainValidator.calls).toEqual([])
      expect(permit2Validate).toHaveBeenCalledWith(order)
      expect(preTransferCheck).toHaveBeenCalled()
    })

    test('rejects a signature that does not verify before the Permit2 check, the transfer check or the write', async () => {
      const { service, repository } = makePostOrderService()

      await expect(service.createOrder(new DutchV2Order(order, ZERO_SIGNATURE, ChainId.MAINNET))).rejects.toThrow(
        'Signature validation failed: InvalidSignature'
      )

      expect(repository.puts).toEqual([])
      expect(permit2Validate).not.toHaveBeenCalled()
      expect(preTransferCheck).not.toHaveBeenCalled()
    })

    test('rejects an order under another swapper with no cosignature', async () => {
      const { service, repository } = makePostOrderService()
      const forged = buildPermissionedOrder({ swapper: TestWallets.stranger.address })

      await expect(service.createOrder(new DutchV2Order(forged, ZERO_SIGNATURE, ChainId.MAINNET))).rejects.toThrow(
        'Signature validation failed: InvalidCosignature'
      )

      expect(repository.puts).toEqual([])
      expect(preTransferCheck).not.toHaveBeenCalled()
    })

    test('rejects an order whose Permit2 nonce is already used', async () => {
      const { service, repository } = makePostOrderService()
      permit2Validate.mockResolvedValue(OrderValidation.NonceUsed)

      await expect(service.createOrder(new DutchV2Order(order, signature, ChainId.MAINNET))).rejects.toThrow(
        'Permit2 validation failed: NonceUsed'
      )

      expect(repository.puts).toEqual([])
    })

    test('rejects a permissioned-token V3 order instead of authenticating it as a Dutch order', async () => {
      const { service, repository } = makePostOrderService()
      const v3 = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.MAINNET, {
        input: { token: Tokens.MAINNET.BUIDL },
      })

      await expect(service.createOrder(new DutchV3Order(v3, signature, ChainId.MAINNET))).rejects.toThrow(
        "Permissioned tokens shouldn't work with priority/v3 dutch orders"
      )

      expect(repository.puts).toEqual([])
      expect(preTransferCheck).not.toHaveBeenCalled()
    })

    test('still rejects an authenticated order the token would not let transfer', async () => {
      const { service, repository } = makePostOrderService()
      preTransferCheck.mockResolvedValue(false)

      await expect(service.createOrder(new DutchV2Order(order, signature, ChainId.MAINNET))).rejects.toThrow(
        'Permissioned Token Pre-transfer check failed'
      )

      expect(repository.puts).toEqual([])
    })
  })
})
