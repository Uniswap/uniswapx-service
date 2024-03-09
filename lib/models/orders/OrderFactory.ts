import {
  CosignedV2DutchOrder as SDKDutchOrderV2,
  DutchOrder as SDKDutchOrder,
  OrderType,
  RelayOrder as SDKRelayOrder,
  RelayOrderParser,
  UniswapXOrderParser,
} from '@uniswap/uniswapx-sdk'
import { DutchOrderV1 } from './DutchOrderV1'
import { DutchOrderV2 } from './DutchOrderV2'
import { LimitOrder } from './LimitOrder'
import { Order } from './Order'
import { RelayOrder } from './RelayOrder'

export class OrderFactory {
  static fromEncoded(encodedOrder: string, chainId: number, signature: string, quoteId?: string): Order {
    const relayOrder = OrderFactory.tryParseRelayOrder(encodedOrder, chainId, signature)
    if (relayOrder) {
      return relayOrder
    }
    const dutchOrder = OrderFactory.tryParseDutchOrder(encodedOrder, chainId, signature, quoteId)
    if (dutchOrder) {
      return dutchOrder
    }

    throw new Error(`Unable to parse encoded order: ${encodedOrder}`)
  }

  static tryParseDutchOrder(
    encodedOrder: string,
    chainId: number,
    signature: string,
    quoteId?: string
  ): DutchOrderV1 | LimitOrder | DutchOrderV2 | null {
    try {
      const uniswapXOrderParser = new UniswapXOrderParser()
      const order = uniswapXOrderParser.parseOrder(encodedOrder, chainId)
      const orderType = uniswapXOrderParser.getOrderType(order)

      if (order instanceof SDKDutchOrder && orderType === OrderType.Dutch) {
        return new DutchOrderV1(order, chainId, signature, quoteId)
      } else if (order instanceof SDKDutchOrder && orderType === OrderType.Limit) {
        return new LimitOrder(order, chainId, signature, quoteId)
      } else if (order instanceof SDKDutchOrderV2 && orderType === OrderType.Dutch_V2) {
        return new DutchOrderV2(order, chainId, signature, quoteId)
      } else {
        console.log('Unrecognized orderType', orderType)
        return null
      }
    } catch (err) {
      console.log('err', err)
      return null
    }
  }

  static tryParseRelayOrder(encodedOrder: string, chainId: number, signature: string): RelayOrder | null {
    try {
      const relayOrderParser = new RelayOrderParser()
      const order = relayOrderParser.parseOrder(encodedOrder, chainId)
      return new RelayOrder(order as SDKRelayOrder, chainId, signature)
    } catch (err) {
      console.log('err', err)
      return null
    }
  }
}
