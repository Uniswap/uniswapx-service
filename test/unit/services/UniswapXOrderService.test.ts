import { Logger } from '@aws-lambda-powertools/logger'
import {
  CosignedV2DutchOrder,
  OrderType,
  OrderValidation,
  OrderValidator,
  PermissionedTokenValidator,
} from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { BigNumber } from 'ethers'
import { mock } from 'jest-mock-extended'
import { toOrderEntity } from '../../../lib/core/orders/storedRow'
import { UniswapXOrderEntity } from '../../../lib/entities'
import { OrderValidationFailedError } from '../../../lib/errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../../lib/errors/TooManyOpenOrdersError'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import * as sfn from '../../../lib/handlers/shared/sfn'
import { DutchV2Order } from '../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { PriorityOrder } from '../../../lib/models/PriorityOrder'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { MAX_QUERY_RETRY, SINGLE_PAGE, UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ChainId } from '../../../lib/util/chain'
import { metrics } from '../../../lib/util/metrics'
import { OffChainUniswapXOrderValidator } from '../../../lib/util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT } from '../../../lib/util/order'
import { Permit2Validator } from '../../../lib/util/Permit2Validator'
import { dutchOrderEntity } from '../../factories/order-entities'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../factories/SDKPriorityOrderFactory'
import { cosignOrder, signOrder } from '../../factories/SignedOrderFactory'
import { SilentServer, silentServerClientOptions } from '../../fakes/silent-server'
import { makePostOrderService } from '../builders/post-path'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'
import { MOCK_PROVIDER_MAP, TestWallets, Tokens, ZERO_SIGNATURE } from '../fixtures'

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

describe('UniswapXOrderService', () => {
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

    await expect(service.createOrder(priorityOrder)).rejects.toThrow(OrderValidationFailedError)
    await expect(service.createOrder(priorityOrder)).rejects.toThrow('auctionStartBlock too low')

    // Verify that validation and persistence were not called
    expect(orderValidator.calls).toEqual([])
    expect(repository.puts).toEqual([])
  })

  test('getDutchOrders calls db with DUTCH_LIMIT and Dutch', async () => {
    const mockOrder = [1, 2, 3].map(() => dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), ''))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: undefined }
    repository.getOrdersFilteredByType.mockResolvedValue({ ...mockResponse })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchOrders(limit, params, undefined)

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(mockResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT],
      undefined // cursor
    )
  })

  test('getDutchOrders loops with empty response', async () => {
    const mockOrder = [1, 2, 3].map(() => dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), ''))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: undefined }
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValue({ ...mockResponse })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchOrders(limit, params, undefined)

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(mockResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT],
      'cursor'
    )
  })

  test('a SINGLE_PAGE service never follows a cursor into further reads', async () => {
    // GET /orders serves exactly one page: each follow-up would be an uncached read against
    // the same hot partition, and the handler discards the cursor anyway.
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: [], cursor: 'cursor' })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP,
      undefined,
      SINGLE_PAGE
    )

    const params = new QueryParamsBuilder().withChainId().build()
    await service.getDutchOrders(50, params, undefined)
    await service.getDutchV2Orders(50, params, undefined)

    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
  })

  test('getDutchOrders applies limit to loop retry', async () => {
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: [], cursor: 'cursor' })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchOrders(limit, params, undefined)

    expect(response).toEqual({ orders: [], cursor: 'cursor' })
    // initial query plus MAX_QUERY_RETRY follow-ups
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(MAX_QUERY_RETRY + 1)
  })

  test('getDutchOrders returns more results than limit in looping edge case', async () => {
    const mockOrder = [1, 2, 3].map(() => dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), ''))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: undefined }
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValue({ ...mockResponse })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 1
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchOrders(limit, params, undefined)

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(mockResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT],
      'cursor'
    )
  })

  test('getDutchV2AndDutchOrders calls db with DUTCH_LIMIT and Dutch', async () => {
    const mockOrder = [1, 2, 3].map(() => dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), ''))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: undefined }
    repository.getOrdersFilteredByType.mockResolvedValue({ ...mockResponse })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchV2AndDutchOrders(limit, params, undefined)

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(mockResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch, DUTCH_LIMIT, OrderType.Dutch_V2],
      undefined // cursor
    )
  })

  test('getDutchV2Orders calls db with Dutch_V2', async () => {
    const dutchV2Orders = [1, 2, 3].map(() => new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))
    const mockOrder = dutchV2Orders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchV2Orders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => DutchV2Order.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V2],
      undefined // cursor
    )
  })

  test('getDutchV2Orders loops with empty response', async () => {
    const dutchV2Orders = [1, 2, 3].map(() => new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))
    const mockOrder = dutchV2Orders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchV2Orders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => DutchV2Order.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V2],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V2],
      'cursor'
    )
  })

  test('getDutchV2Orders applies limit to loop retry', async () => {
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: [], cursor: 'cursor' })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchV2Orders(limit, params, undefined)

    expect(response).toEqual({ orders: [], cursor: 'cursor' })
    // initial query plus MAX_QUERY_RETRY follow-ups
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(MAX_QUERY_RETRY + 1)
  })

  test('getDutchV2Orders returns more results than limit in looping edge case', async () => {
    const dutchV2Orders = [1, 2, 3].map(() => new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))
    const mockOrder = dutchV2Orders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 1
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getDutchV2Orders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => DutchV2Order.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V2],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V2],
      'cursor'
    )
  })

  test('getPriorityOrders calls db with Priority', async () => {
    const priorityOrders = [1, 2, 3].map(() => new PriorityOrder(SDKPriorityOrderFactory.buildPriorityOrder(), '', 1))
    const mockOrder = priorityOrders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getPriorityOrders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => PriorityOrder.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Priority],
      undefined // cursor
    )
  })

  test('getPriorityOrders loops with empty response', async () => {
    const priorityOrders = [1, 2, 3].map(() => new PriorityOrder(SDKPriorityOrderFactory.buildPriorityOrder(), '', 1))
    const mockOrder = priorityOrders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getPriorityOrders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => PriorityOrder.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Priority],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Priority],
      'cursor'
    )
  })

  test('getPriorityOrders applies limit to loop retry', async () => {
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: [], cursor: 'cursor' })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getPriorityOrders(limit, params, undefined)

    expect(response).toEqual({ orders: [], cursor: 'cursor' })
    // initial query plus MAX_QUERY_RETRY follow-ups
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(MAX_QUERY_RETRY + 1)
  })

  test('getLimitOrders calls db with Limit', async () => {
    const mockOrder = [1, 2, 3].map(() => dutchOrderEntity(SDKDutchOrderFactory.buildLimitOrder(), ''))
    const limitRepository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: undefined }
    limitRepository.getOrdersFilteredByType.mockResolvedValue({ ...mockResponse })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(),
      limitRepository, // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getLimitOrders(limit, params, undefined)

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(mockResponse)
    expect(limitRepository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(limitRepository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch],
      undefined // cursor
    )
  })

  test('getDutchV3Orders calls db with Dutch_V3', async () => {
    const dutchV3Orders = [1, 2, 3].map(
      () => new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE), '', ChainId.ARBITRUM_ONE)
    )
    const mockOrder = dutchV3Orders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder()
      .withDesc()
      .withSort()
      .withSortKey()
      .withChainId(ChainId.ARBITRUM_ONE)
      .build()
    const response = await service.getDutchV3Orders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => DutchV3Order.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(1)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V3],
      undefined // cursor
    )
  })

  test('getDutchV3Orders loops with empty response', async () => {
    const dutchV3Orders = [1, 2, 3].map(
      () => new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE), '', ChainId.ARBITRUM_ONE)
    )
    const mockOrder = dutchV3Orders.map((o) => toOrderEntity(o))
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: [], cursor: 'cursor' })
    repository.getOrdersFilteredByType.mockResolvedValueOnce({ orders: mockOrder })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder()
      .withDesc()
      .withSort()
      .withSortKey()
      .withChainId(ChainId.ARBITRUM_ONE)
      .build()
    const response = await service.getDutchV3Orders(limit, params, undefined)
    const expectedResponse = {
      orders: mockOrder.map((o) => DutchV3Order.fromEntity(o).toGetResponse()),
      cursor: undefined,
    }

    expect(response.orders).toHaveLength(3)
    expect(response).toEqual(expectedResponse)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(2)
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V3],
      undefined // cursor
    )
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [OrderType.Dutch_V3],
      'cursor'
    )
  })

  test('getDutchV3Orders applies limit to loop retry', async () => {
    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    repository.getOrdersFilteredByType.mockResolvedValue({ orders: [], cursor: 'cursor' })

    const service = new UniswapXOrderService(
      mock<OffChainUniswapXOrderValidator>(),
      mock<OnChainValidatorMap<OrderValidator>>(),
      repository,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      mock<Logger>(),
      () => {
        return 10
      },
      mock<AnalyticsService>(),
      MOCK_PROVIDER_MAP
    )

    const limit = 50
    const params = new QueryParamsBuilder()
      .withDesc()
      .withSort()
      .withSortKey()
      .withChainId(ChainId.ARBITRUM_ONE)
      .build()
    const response = await service.getDutchV3Orders(limit, params, undefined)

    expect(response).toEqual({ orders: [], cursor: 'cursor' })
    // initial query plus MAX_QUERY_RETRY follow-ups
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(MAX_QUERY_RETRY + 1)
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
