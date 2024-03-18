import { Logger } from '@aws-lambda-powertools/logger'
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
      expect(actual.toSDK()).toEqual(dutchV1Order)
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
      expect(actual.toSDK()).toEqual(limitOrder)
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
      expect(actual.toSDK()).toEqual(dutchV1Order)
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
      expect(actual.toSDK()).toEqual(limitOrder)
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

    it.skip('parses a DutchV2 order', () => {
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
