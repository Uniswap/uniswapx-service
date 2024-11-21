import { Logger } from '@aws-lambda-powertools/logger'
import { KmsSigner } from '@uniswap/signer'
import { OrderType, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../../../lib/handlers/shared/sfn'
import { DutchV1Order, DutchV2Order } from '../../../lib/models'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { PriorityOrder } from '../../../lib/models/PriorityOrder'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { OffChainUniswapXOrderValidator } from '../../../lib/util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT } from '../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SDKPriorityOrderFactory } from '../../factories/SDKPriorityOrderFactory'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'
import { COSIGNATURE, MOCK_PROVIDER_MAP } from '../fixtures'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'

jest.mock('../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

jest.mock('../../../lib/preconditions/preconditions', () => {
  return { checkDefined: jest.fn().mockImplementation((value) => value) }
})

describe('UniswapXOrderService', () => {
  beforeAll(() => {
    jest.spyOn(KmsSigner.prototype, 'signDigest').mockResolvedValue(COSIGNATURE)
  })

  test('createOrder with LimitOrder, propagates correct type', async () => {
    const mockOrderValidator = mock<OffChainUniswapXOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<OrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<OrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const logger = mock<Logger>()
    const AnalyticsService = mock<AnalyticsService>()

    const service = new UniswapXOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<UniswapXOrderEntity>,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), // limit repo
      logger,
      () => {
        return 10
      },
      AnalyticsService,
      MOCK_PROVIDER_MAP
    )

    const order = SDKDutchOrderFactory.buildLimitOrder()

    const response = await service.createOrder(new LimitOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(mockOrderValidator.validate).toHaveBeenCalled()
    expect(onChainValidatorMap.get(1).validate).toHaveBeenCalled()
    expect(repository.countOrdersByOffererAndStatus).toHaveBeenCalled()
    expect(repository.putOrderAndUpdateNonceTransaction).toHaveBeenCalled()
    expect(AnalyticsService.logOrderPosted).toHaveBeenCalledWith(expect.anything(), OrderType.Limit)
    expect(kickoffOrderTrackingSfn).toHaveBeenCalledWith(
      {
        chainId: 1,
        orderHash: response,
        orderStatus: 'open',
        orderType: 'Limit',
        quoteId: '',
        stateMachineArn: undefined,
      },
      undefined
    )
  })

  test('createOrder with PriorityOrder, propagates correct type', async () => {
    const mockOrderValidator = mock<OffChainUniswapXOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<OrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<OrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const logger = mock<Logger>()
    const AnalyticsService = mock<AnalyticsService>()

    const service = new UniswapXOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<UniswapXOrderEntity>,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(),
      logger,
      () => {
        return 10
      },
      AnalyticsService,
      MOCK_PROVIDER_MAP
    )

    const order = SDKPriorityOrderFactory.buildPriorityOrder()

    const response = await service.createOrder(new PriorityOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(mockOrderValidator.validate).toHaveBeenCalled()
    expect(onChainValidatorMap.get(1).validate).toHaveBeenCalled()
    expect(repository.countOrdersByOffererAndStatus).toHaveBeenCalled()
    expect(repository.putOrderAndUpdateNonceTransaction).toHaveBeenCalled()
    expect(AnalyticsService.logOrderPosted).toHaveBeenCalledWith(expect.anything(), OrderType.Priority)
    expect(kickoffOrderTrackingSfn).toHaveBeenCalledWith(
      {
        chainId: 1,
        orderHash: response,
        orderStatus: 'open',
        orderType: 'Priority',
        quoteId: '',
        stateMachineArn: undefined,
      },
      undefined
    )
  })

  test('getDutchOrders calls db with DUTCH_LIMIT and Dutch', async () => {
    const mockOrder = [1, 2, 3].map(() =>
      new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
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
    const mockOrder = [1, 2, 3].map(() =>
      new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
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
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(11)
  })

  test('getDutchOrders returns more results than limit in looping edge case', async () => {
    const mockOrder = [1, 2, 3].map(() =>
      new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
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
    const mockOrder = [1, 2, 3].map(() =>
      new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
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
    const mockOrder = dutchV2Orders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    const mockOrder = dutchV2Orders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(11)
  })

  test('getDutchV2Orders returns more results than limit in looping edge case', async () => {
    const dutchV2Orders = [1, 2, 3].map(() => new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))
    const mockOrder = dutchV2Orders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    const mockOrder = priorityOrders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    const mockOrder = priorityOrders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(11)
  })

  test('getLimitOrders calls db with Limit', async () => {
    const mockOrder = [1, 2, 3].map(() =>
      new LimitOrder(SDKDutchOrderFactory.buildLimitOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
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
    const dutchV3Orders = [1, 2, 3].map(() => new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE), '', ChainId.ARBITRUM_ONE))
    const mockOrder = dutchV3Orders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId(ChainId.ARBITRUM_ONE).build()
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
    const dutchV3Orders = [1, 2, 3].map(() => new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE), '', ChainId.ARBITRUM_ONE))
    const mockOrder = dutchV3Orders.map((o) => o.toEntity(ORDER_STATUS.OPEN))
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
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId(ChainId.ARBITRUM_ONE).build()
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
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId(ChainId.ARBITRUM_ONE).build()
    const response = await service.getDutchV3Orders(limit, params, undefined)

    expect(response).toEqual({ orders: [], cursor: 'cursor' })
    expect(repository.getOrdersFilteredByType).toHaveBeenCalledTimes(11)
  })
})
