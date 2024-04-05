import { Logger } from '@aws-lambda-powertools/logger'
import { AddressZero } from '@ethersproject/constants'
import { OrderValidation, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, RelayOrderEntity } from '../../../lib/entities'
import { TooManyOpenOrdersError } from '../../../lib/errors/TooManyOpenOrdersError'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../../../lib/handlers/shared/sfn'
import { RelayOrder } from '../../../lib/models'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { RelayOrderService } from '../../../lib/services/RelayOrderService'
import { OffChainRelayOrderValidator } from '../../../lib/util/OffChainRelayOrderValidator'
import { SDKRelayOrderFactory } from '../../factories/SDKRelayOrderFactory'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'

jest.mock('../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

jest.mock('../../../lib/preconditions/preconditions', () => {
  return { checkDefined: jest.fn() }
})

describe('RelayOrderService', () => {
  test('createOrder with LimitOrder, propagates correct type', async () => {
    const mockOrderValidator = mock<OffChainRelayOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    const logger = mock<Logger>()

    const service = new RelayOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      }
    )

    const order = SDKRelayOrderFactory.buildRelayOrder()

    const response = await service.createOrder(new RelayOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(mockOrderValidator.validate).toHaveBeenCalled()
    expect(onChainValidatorMap.get(1).validate).toHaveBeenCalled()
    expect(repository.countOrdersByOffererAndStatus).toHaveBeenCalled()
    expect(repository.putOrderAndUpdateNonceTransaction).toHaveBeenCalled()
    expect(kickoffOrderTrackingSfn).toHaveBeenCalledWith(
      {
        chainId: 1,
        orderHash: response,
        orderStatus: 'open',
        orderType: 'Relay',
        quoteId: '',
        stateMachineArn: undefined,
      },
      undefined
    )
  })

  test('createOrder with too many open orders', async () => {
    const mockOrderValidator = mock<OffChainRelayOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.countOrdersByOffererAndStatus.mockResolvedValueOnce(100)

    const logger = mock<Logger>()

    const service = new RelayOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      }
    )

    const order = SDKRelayOrderFactory.buildRelayOrder()

    await expect(service.createOrder(new RelayOrder(order, '0x00', 1))).rejects.toThrow(TooManyOpenOrdersError)
  })

  test('createOrder Address.Zero fails', async () => {
    const mockOrderValidator = mock<OffChainRelayOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.countOrdersByOffererAndStatus.mockResolvedValueOnce(100)

    const logger = mock<Logger>()

    const service = new RelayOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      }
    )

    const order = SDKRelayOrderFactory.buildRelayOrder(1, { input: { token: AddressZero } })

    await expect(service.createOrder(new RelayOrder(order, '0x00', 1))).rejects.toThrow()
  })

  test('createOrder Offchain Validation fails', async () => {
    const mockOrderValidator = mock<OffChainRelayOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: false, errorString: 'Invalid reactor address' })

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.countOrdersByOffererAndStatus.mockResolvedValueOnce(100)

    const logger = mock<Logger>()

    const service = new RelayOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      }
    )

    const order = SDKRelayOrderFactory.buildRelayOrder(1, { input: { token: AddressZero } })

    await expect(service.createOrder(new RelayOrder(order, '0x00', 1))).rejects.toThrow('Invalid reactor address')
  })

  test('createOrder OnChain Validation fails', async () => {
    const mockOrderValidator = mock<OffChainRelayOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.InsufficientFunds)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.countOrdersByOffererAndStatus.mockResolvedValueOnce(100)

    const logger = mock<Logger>()

    const service = new RelayOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      }
    )

    const order = SDKRelayOrderFactory.buildRelayOrder(1, { input: { token: AddressZero } })

    await expect(service.createOrder(new RelayOrder(order, '0x00', 1))).rejects.toThrow(
      'Onchain validation failed: InsufficientFunds'
    )
  })

  test('getRelayOrders returns relay orders', async () => {
    const mockOrder = [1, 2, 3].map(() =>
      new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    )
    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    const mockResponse = { orders: mockOrder, cursor: 'qxy' }
    repository.getOrders.mockResolvedValue({ ...mockResponse })

    const service = new RelayOrderService(
      mock<OffChainRelayOrderValidator>(),
      mock<OnChainValidatorMap<RelayOrderValidator>>(),
      repository,
      mock<Logger>(),
      () => {
        return 10
      }
    )

    const limit = 50
    const params = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()
    const response = await service.getOrders(limit, params, undefined)
    const expected = [...mockOrder.map((o) => RelayOrder.fromEntity(o).toGetResponse())]

    expect(response.orders).toHaveLength(3)
    expect(response.orders).toEqual(expected)
    expect(response.cursor).toEqual('qxy')
    expect(repository.getOrders).toHaveBeenCalledTimes(1)
  })
})
