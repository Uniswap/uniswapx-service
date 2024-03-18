import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { DutchOrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { QUOTE_ID, SIGNATURE, Tokens } from '../fixtures'

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
      const nowInSeconds = Date.now()
      const futureTime = nowInSeconds + 30
      const sdkOrder = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, {
        deadline: futureTime,
        decayEndTime: futureTime,
        decayStartTime: nowInSeconds,
        swapper: '0x0000000000000000000000000000000000000001',
        nonce: '500',
        input: {
          token: Tokens.MAINNET.USDC,
          startAmount: '3000000',
          endAmount: '3000000',
        },
        outputs: [
          {
            token: Tokens.MAINNET.UNI,
            startAmount: '1000000000000000000',
            endAmount: '1000000000000000000',
            recipient: '0x0000000000000000000000000000000000000000',
          },
        ],
      })

      const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)

      const log = mock<Logger>()
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )

      analyticsService.logOrderPosted(order)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        eventType: 'OrderPosted',
        body: {
          quoteId: QUOTE_ID,
          createdAt: '123',
          orderHash: order.orderHash,
          startTime: nowInSeconds,
          endTime: futureTime,
          deadline: futureTime,
          chainId: ChainId.MAINNET,
          inputStartAmount: '3000000',
          inputEndAmount: '3000000',
          tokenIn: Tokens.MAINNET.USDC,
          outputStartAmount: '1000000000000000000',
          outputEndAmount: '1000000000000000000',
          tokenOut: Tokens.MAINNET.UNI,
          filler: '0xGetAddress',
          orderType: 'Limit',
        },
      })
    })

    test('it selects the correct startAmount', () => {
      const nowInSeconds = Date.now()
      const futureTime = nowInSeconds + 30
      const sdkOrder = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, {
        deadline: futureTime,
        decayEndTime: futureTime,
        decayStartTime: nowInSeconds,
        swapper: '0x0000000000000000000000000000000000000001',
        nonce: '500',
        input: {
          token: Tokens.MAINNET.USDC,
          startAmount: '3000000',
          endAmount: '3000000',
        },
        outputs: [
          {
            token: Tokens.MAINNET.UNI,
            startAmount: '1000000000000000000',
            endAmount: '1000000000000000000',
            recipient: '0x0000000000000000000000000000000000000000',
          },
          {
            token: Tokens.MAINNET.WETH,
            startAmount: '4000000000000000000',
            endAmount: '4000000000000000000',
            recipient: '0x0000000000000000000000000000000000000003',
          },
        ],
      })

      const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)
      const log = mock<Logger>()
      const analyticsService = new AnalyticsService(
        log,
        jest.fn().mockReturnValueOnce('123'),
        jest.fn().mockReturnValue('0xGetAddress')
      )
      analyticsService.logOrderPosted(order)

      expect(log.info).toHaveBeenCalledWith('Analytics Message', {
        eventType: 'OrderPosted',
        body: {
          quoteId: QUOTE_ID,
          createdAt: '123',
          orderHash: order.orderHash,
          startTime: nowInSeconds,
          endTime: futureTime,
          deadline: futureTime,
          chainId: ChainId.MAINNET,
          inputStartAmount: '3000000',
          inputEndAmount: '3000000',
          tokenIn: Tokens.MAINNET.USDC,
          outputStartAmount: '4000000000000000000',
          outputEndAmount: '4000000000000000000',
          tokenOut: Tokens.MAINNET.WETH,
          filler: '0xGetAddress',
          orderType: 'Limit',
        },
      })
    })
  })
  describe('logOrderCancelled', () => {
    test('it logs the orderHash and status cancelled', () => {
      const log = mock<Logger>()
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
      const log = mock<Logger>()
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
      const log = mock<Logger>()
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
