import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { MetricsLogger } from 'aws-embedded-metrics'
import { mock } from 'jest-mock-extended'
import { UnsupportedOrderTypeError } from '../../../../lib/errors/UnsupportedOrderTypeError'
import { DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC } from '../../../../lib/handlers/constants'
import { PostOrderBodyParser } from '../../../../lib/handlers/post-order/PostOrderBodyParser'
import { PostOrderRequestBody } from '../../../../lib/handlers/post-order/schema'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { LimitOrder } from '../../../../lib/models/LimitOrder'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { ChainId } from '../../../../lib/util/chain'
import { NullMetrics, setGlobalMetrics } from '../../../../lib/util/metrics'
import { DUTCH_LIMIT } from '../../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { QUOTE_ID, SIGNATURE } from '../../fixtures'

describe('PostOrderBodyParser', () => {
  const parser = new PostOrderBodyParser(mock<Logger>())
  // Joi still lets through order types the parser no longer accepts, so these bodies reach it at runtime.
  const unsupportedTypeBody = (
    orderType: OrderType.Dutch | typeof DUTCH_LIMIT,
    encodedOrder: string
  ): PostOrderRequestBody => ({
    chainId: ChainId.MAINNET,
    orderType,
    encodedOrder,
    signature: SIGNATURE,
    quoteId: QUOTE_ID,
  })
  describe('fromPostRequest - legacy endpoint, no type specified', () => {
    it('rejects a decaying DutchV1 order', () => {
      const dutchV1Order = SDKDutchOrderFactory.buildDutchOrder()
      expect(() =>
        parser.fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType: undefined,
          encodedOrder: dutchV1Order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        })
      ).toThrow(UnsupportedOrderTypeError)
    })

    it('parses a Limit order', () => {
      const limitOrder = SDKDutchOrderFactory.buildLimitOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: undefined,
        encodedOrder: limitOrder.serialize(),
        signature: SIGNATURE,
        quoteId: QUOTE_ID,
      }) as LimitOrder
      expect(actual.orderType).toBe(OrderType.Limit)
      expect(actual.inner).toEqual(limitOrder)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.quoteId).toEqual(QUOTE_ID)
      expect(actual.signature).toEqual(SIGNATURE)
    })
  })

  describe('fromPostRequest - type specified', () => {
    it('rejects a DutchV1 order', () => {
      const dutchV1Order = SDKDutchOrderFactory.buildDutchOrder()
      expect(() => parser.fromPostRequest(unsupportedTypeBody(OrderType.Dutch, dutchV1Order.serialize()))).toThrow(
        UnsupportedOrderTypeError
      )
    })

    it('rejects a DutchLimit order', () => {
      const limitOrder = SDKDutchOrderFactory.buildLimitOrder()
      expect(() => parser.fromPostRequest(unsupportedTypeBody(DUTCH_LIMIT, limitOrder.serialize()))).toThrow(
        'Unsupported orderType: DutchLimit'
      )
    })

    it('rejects a decaying DutchV1 order posted as a Limit order', () => {
      const dutchV1Order = SDKDutchOrderFactory.buildDutchOrder()
      expect(() =>
        parser.fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType: OrderType.Limit,
          encodedOrder: dutchV1Order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        })
      ).toThrow(UnsupportedOrderTypeError)
    })

    it('parses a Limit order', () => {
      const limitOrder = SDKDutchOrderFactory.buildLimitOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: OrderType.Limit,
        encodedOrder: limitOrder.serialize(),
        signature: SIGNATURE,
        quoteId: QUOTE_ID,
      }) as LimitOrder
      expect(actual.orderType).toBe(OrderType.Limit)
      expect(actual.inner).toEqual(limitOrder)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.quoteId).toEqual(QUOTE_ID)
      expect(actual.signature).toEqual(SIGNATURE)
    })

    it('throws on an invalid Limit order', () => {
      expect(() =>
        parser.fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType: OrderType.Limit,
          encodedOrder: 'fakeEncodedOrder',
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        })
      ).toThrow()
    })

    it('parses a DutchV2 order', () => {
      const dutchV2Order = SDKDutchOrderV2Factory.buildDutchV2Order()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: OrderType.Dutch_V2,
        encodedOrder: dutchV2Order.serialize(),
        signature: SIGNATURE,
      }) as DutchV2Order
      expect(actual.orderType).toBe(OrderType.Dutch_V2)
      expect(actual.inner).toEqual(dutchV2Order)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.signature).toEqual(SIGNATURE)
    })

    it('parses a DutchV3 order', () => {
      const dutchV3Order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE)
      const actual = parser.fromPostRequest({
        chainId: ChainId.ARBITRUM_ONE,
        orderType: OrderType.Dutch_V3,
        encodedOrder: dutchV3Order.serialize(),
        signature: SIGNATURE,
      }) as DutchV3Order
      expect(actual.orderType).toBe(OrderType.Dutch_V3)
      expect(actual.inner).toEqual(dutchV3Order)
      expect(actual.chainId).toEqual(ChainId.ARBITRUM_ONE)
      expect(actual.signature).toEqual(SIGNATURE)
    })

    it('parses a Priority order', () => {
      const priorityOrder = SDKPriorityOrderFactory.buildPriorityOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: OrderType.Priority,
        encodedOrder: priorityOrder.serialize(),
        signature: SIGNATURE,
      }) as PriorityOrder
      expect(actual.orderType).toBe(OrderType.Priority)
      expect(actual.inner).toEqual(priorityOrder)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.signature).toEqual(SIGNATURE)
    })
  })

  describe('Dutch_V2 staleness metrics', () => {
    // The parser's clock, ahead of the real one so a parser reading the real clock fails these. The
    // SDK's builder checks deadlines against the real clock, so every time here stays in the future.
    const NOW = Math.floor(Date.now() / 1000) + 1_000
    let putMetric: jest.Mock

    beforeEach(() => {
      putMetric = jest.fn()
      setGlobalMetrics({ putMetric } as unknown as MetricsLogger)
    })

    afterAll(() => {
      setGlobalMetrics(new NullMetrics())
    })

    const parseV2At = (decayStartTime: number, chainId: ChainId) => {
      const order = SDKDutchOrderV2Factory.buildDutchV2Order(chainId, {
        cosignerData: { decayStartTime, decayEndTime: decayStartTime + 60 },
        deadline: decayStartTime + 120,
      })
      new PostOrderBodyParser(mock<Logger>(), () => NOW).fromPostRequest({
        chainId,
        orderType: OrderType.Dutch_V2,
        encodedOrder: order.serialize(),
        signature: SIGNATURE,
      })
    }

    it('records how far ahead the decay starts, and a stale order past the threshold on mainnet', () => {
      parseV2At(NOW + DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC + 5, ChainId.MAINNET)
      expect(putMetric.mock.calls).toEqual([
        ['StaleOrder-chain-1', 1, 'Count'],
        ['OrderStaleness-chain-1', DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC + 5],
      ])
    })

    it('records only the staleness within the threshold', () => {
      parseV2At(NOW + DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC, ChainId.MAINNET)
      expect(putMetric.mock.calls).toEqual([['OrderStaleness-chain-1', DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC]])
    })

    it('never counts a stale order off mainnet', () => {
      parseV2At(NOW + DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC + 5, ChainId.ARBITRUM_ONE)
      expect(putMetric.mock.calls).toEqual([['OrderStaleness-chain-42161', DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC + 5]])
    })
  })

  describe('parse failures', () => {
    it.each([
      [OrderType.Dutch_V2, 'DutchV2'],
      [OrderType.Dutch_V3, 'DutchV3'],
      [OrderType.Priority, 'Priority'],
      [OrderType.Limit, 'Limit'],
    ])('logs one %s failure with the encoded order and without the signature', (orderType, label) => {
      const logger = mock<Logger>()
      expect(() =>
        new PostOrderBodyParser(logger).fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType,
          encodedOrder: '0xdeadbeef',
          signature: SIGNATURE,
        })
      ).toThrow()

      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledWith(`Unable to parse ${label} order`, {
        err: expect.anything(),
        encodedOrder: '0xdeadbeef',
        chainId: ChainId.MAINNET,
      })
      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})
