import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DutchV3OrderEntity, ORDER_STATUS, PriorityOrderEntity, UniswapXOrderEntity } from '../../../lib/entities'
import { AnalyticsService } from '../../../lib/services/analytics-service'

describe('Analytics Service', () => {
  const mockedOrder: UniswapXOrderEntity = {
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
  })

  // Multi-output orders: the swapper's output plus a smaller fee output in the same token. The fee's
  // leading digit is higher, so a comparison of the amounts as strings would pick the fee.
  describe('logOrderPosted picks the swapper output by amount', () => {
    const logged = (order: UniswapXOrderEntity) => {
      const info = jest.fn()
      const service = new AnalyticsService(
        { info } as unknown as Logger,
        () => '123',
        () => '0xGetAddress'
      )
      service.logOrderPosted(order, order.type)
      return info.mock.calls[0][1].body
    }

    // The fields every order type shares.
    const { encodedOrder, signature, nonce, orderHash, orderStatus, chainId, offerer, reactor, deadline } = mockedOrder
    const shared = {
      encodedOrder,
      signature,
      nonce,
      orderHash,
      orderStatus,
      chainId,
      offerer,
      reactor,
      deadline,
      cosignature: '0x06',
    }

    // [decimals, swapper output, fee output]
    const AMOUNTS: [number, string, string][] = [
      [6, '2000000', '99999'],
      [8, '200000000', '9999999'],
      [18, '2000000000000000000', '99999999999999'],
    ]

    it.each(AMOUNTS)('Dutch V1/V2 and limit, %i decimals', (_decimals, swapper, fee) => {
      const order: UniswapXOrderEntity = {
        ...mockedOrder,
        outputs: [
          { token: '0xOutputToken', startAmount: swapper, endAmount: swapper, recipient: '0xSwapper' },
          { token: '0xOutputToken', startAmount: fee, endAmount: fee, recipient: '0xFee' },
        ],
      }
      expect(logged(order)).toEqual(expect.objectContaining({ outputStartAmount: swapper, outputEndAmount: swapper }))
    })

    it.each(AMOUNTS)('Dutch V3, %i decimals', (_decimals, swapper, fee) => {
      const curve = (amount: string) => ({ relativeBlocks: [1], relativeAmounts: [amount] })
      const order: DutchV3OrderEntity = {
        ...shared,
        type: OrderType.Dutch_V3,
        startingBaseFee: '0',
        cosignerData: { decayStartBlock: 1, exclusiveFiller: '0x00', inputOverride: '0', outputOverrides: ['0', '0'] },
        input: {
          token: '0xInputToken',
          startAmount: '5000',
          curve: curve('0'),
          maxAmount: '5000',
          adjustmentPerGweiBaseFee: '0',
        },
        outputs: [
          {
            token: '0xOutputToken',
            startAmount: swapper,
            curve: curve(swapper),
            minAmount: swapper,
            recipient: '0xSwapper',
            adjustmentPerGweiBaseFee: '0',
          },
          {
            token: '0xOutputToken',
            startAmount: fee,
            curve: curve(fee),
            minAmount: fee,
            recipient: '0xFee',
            adjustmentPerGweiBaseFee: '0',
          },
        ],
      }
      expect(logged(order)).toEqual(
        expect.objectContaining({ outputStartAmount: swapper, outputCurve: JSON.stringify(curve(swapper)) })
      )
    })

    it.each(AMOUNTS)('Priority, %i decimals', (_decimals, swapper, fee) => {
      const order: PriorityOrderEntity = {
        ...shared,
        type: OrderType.Priority,
        auctionStartBlock: 1,
        baselinePriorityFeeWei: '0',
        cosignerData: { auctionTargetBlock: 1 },
        input: { token: '0xInputToken', amount: '5000', mpsPerPriorityFeeWei: '0' },
        outputs: [
          { token: '0xOutputToken', amount: swapper, mpsPerPriorityFeeWei: '1', recipient: '0xSwapper' },
          { token: '0xOutputToken', amount: fee, mpsPerPriorityFeeWei: '2', recipient: '0xFee' },
        ],
      }
      expect(logged(order)).toEqual(
        expect.objectContaining({
          outputStartAmount: swapper,
          outputEndAmount: swapper,
          outputMpsPerPriorityFeeWei: '1',
        })
      )
    })

    it('keeps the later output on a tie, as before', () => {
      const order: UniswapXOrderEntity = {
        ...mockedOrder,
        outputs: [
          { token: '0xOutputToken', startAmount: '5', endAmount: '1', recipient: '0xFirst' },
          { token: '0xOutputToken', startAmount: '5', endAmount: '2', recipient: '0xSecond' },
        ],
      }
      expect(logged(order)).toEqual(expect.objectContaining({ outputEndAmount: '2' }))
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
