import { default as Logger } from 'bunyan'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { PostOrderBodyParser } from '../../../../lib/handlers/post-order/PostOrderBodyParser'
import { DutchV1Order } from '../../../../lib/models/DutchV1Order'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { LimitOrder } from '../../../../lib/models/LimitOrder'
import { RelayOrder } from '../../../../lib/models/RelayOrder'
import { ChainId } from '../../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKRelayOrderFactory } from '../../../factories/SDKRelayOrderFactory'
import { QUOTE_ID, SIGNATURE } from '../../fixtures'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'

describe('PostOrderBodyParser', () => {
  const parser = new PostOrderBodyParser(mock<Logger>())
  describe('fromPostRequest - legacy endpoint, no type specified', () => {
    it('parses a DutchV1 order', () => {
      const dutchV1Order = SDKDutchOrderFactory.buildDutchOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: undefined,
        encodedOrder: dutchV1Order.serialize(),
        signature: SIGNATURE,
        quoteId: QUOTE_ID,
      }) as DutchV1Order
      expect(actual.orderType).toBe(OrderType.Dutch)
      expect(actual.inner).toEqual(dutchV1Order)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.quoteId).toEqual(QUOTE_ID)
      expect(actual.signature).toEqual(SIGNATURE)
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
    it('parses a DutchV1 order', () => {
      const dutchV1Order = SDKDutchOrderFactory.buildDutchOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: OrderType.Dutch,
        encodedOrder: dutchV1Order.serialize(),
        signature: SIGNATURE,
        quoteId: QUOTE_ID,
      }) as DutchV1Order
      expect(actual.orderType).toBe(OrderType.Dutch)
      expect(actual.inner).toEqual(dutchV1Order)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.quoteId).toEqual(QUOTE_ID)
      expect(actual.signature).toEqual(SIGNATURE)
    })

    it('throws on an invalid DutchV1Order', () => {
      expect(() =>
        parser.fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType: OrderType.Dutch,
          encodedOrder: 'fakeEncodedOrder',
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        })
      ).toThrow()
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

    it('parses a Relay order', () => {
      const relayOrder = SDKRelayOrderFactory.buildRelayOrder()
      const actual = parser.fromPostRequest({
        chainId: ChainId.MAINNET,
        orderType: OrderType.Relay,
        encodedOrder: relayOrder.serialize(),
        signature: SIGNATURE,
      }) as RelayOrder
      expect(actual.orderType).toBe(OrderType.Relay)
      expect(actual.inner).toEqual(relayOrder)
      expect(actual.chainId).toEqual(ChainId.MAINNET)
      expect(actual.signature).toEqual(SIGNATURE)
    })

    it('throws on an invalid Relay order', () => {
      expect(() =>
        parser.fromPostRequest({
          chainId: ChainId.MAINNET,
          orderType: OrderType.Relay,
          encodedOrder: 'invalid relay order',
          signature: SIGNATURE,
        })
      ).toThrow()
    })
  })
})
