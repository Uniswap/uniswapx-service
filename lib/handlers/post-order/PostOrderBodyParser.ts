import { Logger } from '@aws-lambda-powertools/logger'
import {
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  OrderType,
  DutchOrder as SDKDutchOrder,
  CosignedPriorityOrder as SDKPriorityOrder,
  UniswapXOrderParser,
} from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { UnexpectedOrderTypeError } from '../../errors/UnexpectedOrderTypeError'
import { UnsupportedOrderTypeError } from '../../errors/UnsupportedOrderTypeError'
import { DutchV2Order } from '../../models/DutchV2Order'
import { DutchV3Order } from '../../models/DutchV3Order'
import { LimitOrder } from '../../models/LimitOrder'
import { PriorityOrder } from '../../models/PriorityOrder'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC } from '../constants'
import { PostOrderRequestBody } from './schema'

export type PostableOrder = LimitOrder | DutchV2Order | DutchV3Order | PriorityOrder

export class PostOrderBodyParser {
  private readonly uniswapXParser = new UniswapXOrderParser()

  constructor(
    private readonly logger: Logger,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
  ) {}

  fromPostRequest(body: PostOrderRequestBody): PostableOrder {
    const { encodedOrder, signature, chainId, orderType, quoteId, requestId } = body
    switch (orderType) {
      case OrderType.Limit:
      case undefined:
        // Orders without an orderType use the legacy V1 encoding, which now only carries limit orders.
        return this.tryParse('Limit', chainId, encodedOrder, () =>
          this.parseLimit(encodedOrder, signature, chainId, quoteId)
        )
      case OrderType.Dutch_V2:
        return this.tryParse('DutchV2', chainId, encodedOrder, () => {
          const order = CosignedV2DutchOrder.parse(encodedOrder, chainId)
          this.recordV2Staleness(order, chainId)
          return new DutchV2Order(order, signature, chainId, quoteId, requestId)
        })
      case OrderType.Dutch_V3:
        return this.tryParse(
          'DutchV3',
          chainId,
          encodedOrder,
          () =>
            new DutchV3Order(CosignedV3DutchOrder.parse(encodedOrder, chainId), signature, chainId, quoteId, requestId)
        )
      case OrderType.Priority:
        return this.tryParse(
          'Priority',
          chainId,
          encodedOrder,
          () => new PriorityOrder(SDKPriorityOrder.parse(encodedOrder, chainId), signature, chainId, quoteId, requestId)
        )
      default:
        // The request schema still lets through order types we no longer accept (Dutch, DutchLimit).
        throw new UnsupportedOrderTypeError(orderType)
    }
  }

  // One failure log per post, with the encoded order and without the signature.
  private tryParse<T>(label: string, chainId: number, encodedOrder: string, parse: () => T): T {
    try {
      return parse()
    } catch (err) {
      this.logger.error(`Unable to parse ${label} order`, { err, encodedOrder, chainId })
      throw err
    }
  }

  private parseLimit(encodedOrder: string, signature: string, chainId: number, quoteId?: string): LimitOrder {
    const order = this.uniswapXParser.parseOrder(encodedOrder, chainId)
    // The SDK labels a V1 order with any decay as Dutch and one without decay as Limit.
    const orderType = this.uniswapXParser.getOrderType(order)
    if (orderType === OrderType.Limit) {
      return new LimitOrder(order as SDKDutchOrder, signature, chainId, quoteId)
    }
    if (orderType === OrderType.Dutch) {
      throw new UnsupportedOrderTypeError(orderType)
    }
    throw new UnexpectedOrderTypeError(orderType)
  }

  // How far ahead of now the cosigner started the decay. GPA sets mainnet's 24 s ahead.
  private recordV2Staleness(order: CosignedV2DutchOrder, chainId: number): void {
    const timeDifference = Number(order.info.cosignerData.decayStartTime) - this.nowSeconds()
    if (chainId == ChainId.MAINNET && timeDifference > DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC) {
      metrics.putMetric(`StaleOrder-chain-${chainId}`, 1, Unit.Count)
    }
    metrics.putMetric(`OrderStaleness-chain-${chainId}`, timeDifference)
  }
}
