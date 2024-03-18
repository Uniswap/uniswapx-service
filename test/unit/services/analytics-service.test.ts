import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DutchOrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { AnalyticsService } from '../../../lib/services/analytics-service'

describe('Analytics Service', () => {
  const mockedOrder: DutchOrderEntity = {
    type: OrderType.Limit,
    encodedOrder: '0x01',
    signature: '0x02',
    nonce: '1',
    orderHash: '0x03',
    orderStatus: ORDER_STATUS.OPEN,
    chainId: 1,
    offerer: '0x04',
    reactor: '0x05',
    decayStartTime: 100,
    decayEndTime: 200,
    deadline: 300,
    input: {
      token: '0xInputToken',
      startAmount: '5000',
      endAmount: '6000',
    },
    outputs: [
      { token: '0xOutputToken', startAmount: '7000', endAmount: '8000', recipient: '0xRecipient' },
      { token: '0xOutputToken', startAmount: '10', endAmount: '10', recipient: '0xRecipient' },
    ],
  }

  describe('logOrderPosted', () => {
    test('it creates', () => {
      const service = AnalyticsService.create()
      expect(service).toBeDefined()
    })
    test('it creates an event with all fields defined', () => {
      const log = { info: jest.fn() } as unknown as Logger
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )

      analyticsService.logOrderPosted(mockedOrder, OrderType.Limit)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        eventType: 'OrderPosted',
        body: {
          quoteId: mockedOrder.quoteId,
          createdAt: '123',
          orderHash: mockedOrder.orderHash,
          startTime: mockedOrder.decayStartTime,
          endTime: mockedOrder.decayEndTime,
          deadline: mockedOrder.deadline,
          chainId: mockedOrder.chainId,
          inputStartAmount: mockedOrder.input?.startAmount,
          inputEndAmount: mockedOrder.input?.endAmount,
          tokenIn: mockedOrder.input?.token,
          outputStartAmount: '7000',
          outputEndAmount: '8000',
          tokenOut: '0xOutputToken',
          filler: '0xGetAddress',
          orderType: 'Limit',
        },
      })
    })

    test('it selects the correct startAmount', () => {
      const log = { info: jest.fn() } as unknown as Logger
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )
      const order = { ...mockedOrder }
      ;(order.outputs = [
        { token: '0xOutputToken', startAmount: '1', endAmount: '1', recipient: '0xRecipient' },
        { token: '0xOutputToken', startAmount: '7000', endAmount: '8000', recipient: '0xRecipient' },
      ]),
        analyticsService.logOrderPosted(mockedOrder, OrderType.Limit)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        eventType: 'OrderPosted',
        body: {
          quoteId: mockedOrder.quoteId,
          createdAt: '123',
          orderHash: mockedOrder.orderHash,
          startTime: mockedOrder.decayStartTime,
          endTime: mockedOrder.decayEndTime,
          deadline: mockedOrder.deadline,
          chainId: mockedOrder.chainId,
          inputStartAmount: mockedOrder.input?.startAmount,
          inputEndAmount: mockedOrder.input?.endAmount,
          tokenIn: mockedOrder.input?.token,
          outputStartAmount: '7000',
          outputEndAmount: '8000',
          tokenOut: '0xOutputToken',
          filler: '0xGetAddress',
          orderType: 'Limit',
        },
      })
    })
  })
  describe('logOrderCancelled', () => {
    test('it logs the orderHash and status cancelled', () => {
      const log = { info: jest.fn() } as unknown as Logger
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )
      const order = { ...mockedOrder }

      analyticsService.logCancelled(order.orderHash, OrderType.Limit)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        orderInfo: {
          orderHash: mockedOrder.orderHash,
          orderType: 'Limit',
          orderStatus: ORDER_STATUS.CANCELLED,
        },
      })
    })

    test('it logs the orderHash and status cancelled', () => {
      const log = { info: jest.fn() } as unknown as Logger
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )
      const order = { ...mockedOrder }

      analyticsService.logCancelled(order.orderHash, OrderType.Limit)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        orderInfo: {
          orderHash: mockedOrder.orderHash,
          orderType: 'Limit',
          orderStatus: ORDER_STATUS.CANCELLED,
        },
      })
    })
  })
  describe('logOrderInsufficientFunds', () => {
    test('it logs the orderHash and status insufficient funds', () => {
      const log = { info: jest.fn() } as unknown as Logger
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )
      const order = { ...mockedOrder }

      analyticsService.logInsufficientFunds(order.orderHash, OrderType.Limit)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        orderInfo: {
          orderHash: mockedOrder.orderHash,
          orderType: 'Limit',
          orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        },
      })
    })
  })
})
