import { Logger } from '@aws-lambda-powertools/logger'
import { AddressZero } from '@ethersproject/constants'
import { OrderValidation, RelayEventWatcher, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { BigNumber, ethers } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, RelayOrderEntity } from '../../../lib/entities'
import { TooManyOpenOrdersError } from '../../../lib/errors/TooManyOpenOrdersError'
import { FillEventLogger } from '../../../lib/handlers/check-order-status/fill-event-logger'
import { EventWatcherMap } from '../../../lib/handlers/EventWatcherMap'
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      },
      mock<FillEventLogger>()
    )

    const order = SDKRelayOrderFactory.buildRelayOrder()
    process.env[`STATE_MACHINE_ARN_1`] = 'defined'

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
        stateMachineArn: 'defined',
      },
      'defined'
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      },
      mock<FillEventLogger>()
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      },
      mock<FillEventLogger>()
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      },
      mock<FillEventLogger>()
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository as unknown as BaseOrdersRepository<RelayOrderEntity>,
      logger,
      () => {
        return 10
      },
      mock<FillEventLogger>()
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
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository,
      mock<Logger>(),
      () => {
        return 10
      },
      mock<FillEventLogger>()
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

  test('checkOrderStatus, unfilled', async () => {
    const mockOrder = new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.getByHash.mockResolvedValue(mockOrder)

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const service = new RelayOrderService(
      mock<OffChainRelayOrderValidator>(),
      onChainValidatorMap,
      mock<EventWatcherMap<RelayEventWatcher>>(),
      repository,
      mock<Logger>(),
      () => {
        return 10
      },
      mock<FillEventLogger>()
    )

    const response = await service.checkOrderStatus(
      mockOrder.orderHash,
      '',
      100,
      ORDER_STATUS.OPEN,
      0,
      0,
      mock<ethers.providers.StaticJsonRpcProvider>()
    )

    expect(response).toEqual({
      chainId: 1,
      orderHash: mockOrder.orderHash,
      orderStatus: 'open',
      quoteId: '',
      retryCount: 1,
      retryWaitSeconds: 12,
      startingBlockNumber: 100,
    })
  })

  test('checkOrderStatus, Expired and filled', async () => {
    const mockOrder = new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.getByHash.mockResolvedValue(mockOrder)

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.Expired)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const mockEventWatcher = mock<RelayEventWatcher>()
    mockEventWatcher.getFillInfo.mockResolvedValue([
      {
        orderHash: mockOrder.orderHash,
        filler: '0xfiller',
        nonce: BigNumber.from('100'),
        swapper: '0xswapper',
        blockNumber: 123,
        txHash: '0xtxhash',
        inputs: [
          {
            token: '0xtokenIn',
            amount: BigNumber.from(1),
          },
        ],
        outputs: [
          {
            token: '0xtokenOut',
            amount: BigNumber.from(1),
          },
        ],
      },
    ])

    const eventWatcherMap = mock<EventWatcherMap<RelayEventWatcher>>()
    eventWatcherMap.get.mockReturnValue(mockEventWatcher)

    const service = new RelayOrderService(
      mock<OffChainRelayOrderValidator>(),
      onChainValidatorMap,
      eventWatcherMap,
      repository,
      mock<Logger>(),
      () => {
        return 10
      },
      mock<FillEventLogger>()
    )

    const mockProvider = mock<ethers.providers.StaticJsonRpcProvider>()
    mockProvider.getBlock.mockResolvedValue({ timestamp: 1 } as any)
    mockProvider.getTransaction.mockResolvedValue({} as any)

    const response = await service.checkOrderStatus(mockOrder.orderHash, '', 100, ORDER_STATUS.OPEN, 0, 0, mockProvider)

    expect(response).toEqual({
      chainId: 1,
      orderHash: mockOrder.orderHash,
      orderStatus: 'filled',
      quoteId: '',
      retryCount: 1,
      retryWaitSeconds: 12,
      settledAmounts: [
        {
          amountIn: '1000000',
          amountOut: '1',
          tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenOut: '0xtokenOut',
        },
      ],
      startingBlockNumber: 100,
      txHash: '0xtxhash',
    })
  })

  test('checkOrderStatus, NonceUsed and filled', async () => {
    const mockOrder = new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
    const repository = mock<BaseOrdersRepository<RelayOrderEntity>>()
    repository.getByHash.mockResolvedValue(mockOrder)

    const onChainValidator = mock<RelayOrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.NonceUsed)

    const onChainValidatorMap = mock<OnChainValidatorMap<RelayOrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const mockEventWatcher = mock<RelayEventWatcher>()
    mockEventWatcher.getFillInfo.mockResolvedValue([
      {
        orderHash: mockOrder.orderHash,
        filler: '0xfiller',
        nonce: BigNumber.from('100'),
        swapper: '0xswapper',
        blockNumber: 123,
        txHash: '0xtxhash',
        inputs: [
          {
            token: '0xtokenIn',
            amount: BigNumber.from(1),
          },
        ],
        outputs: [
          {
            token: '0xtokenOut',
            amount: BigNumber.from(1),
          },
        ],
      },
    ])

    const eventWatcherMap = mock<EventWatcherMap<RelayEventWatcher>>()
    eventWatcherMap.get.mockReturnValue(mockEventWatcher)

    const service = new RelayOrderService(
      mock<OffChainRelayOrderValidator>(),
      onChainValidatorMap,
      eventWatcherMap,
      repository,
      mock<Logger>(),
      () => {
        return 10
      },
      mock<FillEventLogger>()
    )

    const mockProvider = mock<ethers.providers.StaticJsonRpcProvider>()
    mockProvider.getBlock.mockResolvedValue({ timestamp: 1 } as any)
    mockProvider.getTransaction.mockResolvedValue({} as any)

    const response = await service.checkOrderStatus(mockOrder.orderHash, '', 100, ORDER_STATUS.OPEN, 0, 0, mockProvider)

    expect(response).toEqual({
      chainId: 1,
      orderHash: mockOrder.orderHash,
      orderStatus: 'filled',
      quoteId: '',
      retryCount: 1,
      retryWaitSeconds: 12,
      settledAmounts: [
        {
          amountIn: '1000000',
          amountOut: '1',
          tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenOut: '0xtokenOut',
        },
      ],
      startingBlockNumber: 100,
      txHash: '0xtxhash',
    })
  })
})
