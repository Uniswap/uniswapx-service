import { Logger } from '@aws-lambda-powertools/logger'
import {
  CosignedV2DutchOrder,
  CosignedV2DutchOrder as SDKV2DutchOrder,
  DutchOrder as SDKDutchOrder,
  OrderType,
  RelayOrder as SDKRelayOrder,
  RelayOrderParser,
  UniswapXOrderParser,
} from '@uniswap/uniswapx-sdk'
import { UnexpectedOrderTypeError } from '../../errors/UnexpectedOrderTypeError'
import { DutchV1Order } from '../../models/DutchV1Order'
import { DutchV2Order } from '../../models/DutchV2Order'
import { LimitOrder } from '../../models/LimitOrder'
import { Order } from '../../models/Order'
import { RelayOrder } from '../../models/RelayOrder'
import { PostOrderRequestBody } from './schema'

export class PostOrderBodyParser {
  private readonly uniswapXParser = new UniswapXOrderParser()
  private readonly relayParser = new RelayOrderParser()

  constructor(private readonly logger: Logger) {}
  fromPostRequest(body: PostOrderRequestBody): Order {
    const { encodedOrder, signature, chainId, orderType } = body
    switch (orderType) {
      case OrderType.Dutch:
        return this.tryParseDutchV1Order(encodedOrder, signature, chainId, body.quoteId)
      case OrderType.Limit:
        return this.tryParseLimitOrder(encodedOrder, signature, chainId, body.quoteId)
      case OrderType.Dutch_V2:
        return this.tryParseDutchV2Order(encodedOrder, signature, chainId)
      case OrderType.Relay:
        return this.tryParseRelayOrder(encodedOrder, signature, chainId)

      case undefined:
        // If an OrderType is not explicitly set, it is the legacy format which is either a DutchOrderV1 or a LimitOrder.
        // Try to parse both and see which hits.
        return this.tryParseDutchOrder(encodedOrder, signature, chainId, body.quoteId)
    }
  }

  private tryParseRelayOrder(encodedOrder: string, signature: string, chainId: number): RelayOrder {
    try {
      const order = this.relayParser.parseOrder(encodedOrder, chainId)
      const orderType = this.relayParser.getOrderType(order)
      if (orderType === OrderType.Relay) {
        return new RelayOrder(order as SDKRelayOrder, signature, chainId)
      }
      throw new UnexpectedOrderTypeError(orderType)
    } catch (err) {
      this.logger.error('Unable to parse Relay order', {
        err,
        encodedOrder,
        chainId,
        signature,
      })
      throw err
    }
  }

  private tryParseDutchV1Order(
    encodedOrder: string,
    signature: string,
    chainId: number,
    quoteId?: string
  ): DutchV1Order {
    try {
      const order = this.tryParseDutchOrder(encodedOrder, signature, chainId, quoteId)
      if (order.orderType === OrderType.Dutch) {
        return order
      }
      throw new UnexpectedOrderTypeError(order.orderType)
    } catch (err) {
      this.logger.error('Unable to parse DutchV1 order', {
        err,
        encodedOrder,
        chainId,
        signature,
      })
      throw err
    }
  }

  private tryParseDutchV2Order(encodedOrder: string, signature: string, chainId: number): DutchV2Order {
    try {
      const order = CosignedV2DutchOrder.parse(encodedOrder, chainId)
      const orderType = OrderType.Dutch_V2
      if (orderType === OrderType.Dutch_V2) {
        return new DutchV2Order(order as SDKV2DutchOrder, signature, chainId)
      }
      throw new UnexpectedOrderTypeError(orderType)
    } catch (err) {
      this.logger.error('Unable to parse DutchV2 order', {
        err,
        encodedOrder,
        chainId,
        signature,
      })
      throw err
    }
  }

  private tryParseLimitOrder(encodedOrder: string, signature: string, chainId: number, quoteId?: string): LimitOrder {
    try {
      const order = this.tryParseDutchOrder(encodedOrder, signature, chainId, quoteId)
      if (order.orderType === OrderType.Limit) {
        return order
      }
      throw new UnexpectedOrderTypeError(order.orderType)
    } catch (err) {
      this.logger.error('Unable to parse Limit order', {
        err,
        encodedOrder,
        chainId,
        signature,
      })
      throw err
    }
  }

  tryParseDutchOrder(encodedOrder: string, signature: string, chainId: number, quoteId?: string) {
    try {
      const order = this.uniswapXParser.parseOrder(encodedOrder, chainId)
      const orderType = this.uniswapXParser.getOrderType(order)
      if (orderType === OrderType.Limit) {
        return new LimitOrder(order as SDKDutchOrder, signature, chainId, quoteId)
      } else if (orderType === OrderType.Dutch) {
        return new DutchV1Order(order as SDKDutchOrder, signature, chainId, quoteId)
      } else {
        throw new UnexpectedOrderTypeError(orderType)
      }
    } catch (err) {
      this.logger.error('Unable to parse legacy Dutch order', {
        err,
        encodedOrder,
        chainId,
        signature,
      })
      throw err
    }
  }
}
