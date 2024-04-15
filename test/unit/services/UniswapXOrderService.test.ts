import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../../../lib/handlers/shared/sfn'
import { DutchV1Order, DutchV2Order } from '../../../lib/models'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { OffChainUniswapXOrderValidator } from '../../../lib/util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT } from '../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'
jest.mock('../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

jest.mock('../../../lib/preconditions/preconditions', () => {
  return { checkDefined: jest.fn() }
})
describe('UniswapXOrderService', () => {
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
      AnalyticsService
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
      mock<AnalyticsService>()
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
      mock<AnalyticsService>()
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
      mock<AnalyticsService>()
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
      mock<AnalyticsService>()
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
})
