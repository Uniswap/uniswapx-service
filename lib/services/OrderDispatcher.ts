import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { NoHandlerConfiguredError } from '../errors/NoHandlerConfiguredError'
import { DutchV1Order } from '../models/DutchV1Order'
import { DutchV2Order } from '../models/DutchV2Order'
import { LimitOrder } from '../models/LimitOrder'
import { Order } from '../models/Order'
import { UniswapXOrderService } from './UniswapXOrderService'

export class OrderDispatcher {
  constructor(private readonly uniswapXService: UniswapXOrderService, private readonly logger: Logger) {}

  createOrder(order: Order): Promise<string> {
    if (this.isUniswapXOrder(order)) {
      return this.uniswapXService.createOrder(order)
    }

    this.logger.error(`No createOrder handler configured for orderType: ${order.orderType}!`)
    // When a RelayOrderService is configured, add the additional check here.
    throw new NoHandlerConfiguredError(order.orderType)
  }

  private isUniswapXOrder(order: Order): order is DutchV1Order | LimitOrder | DutchV2Order {
    // Once the UniswapXService supports Xv2, add the type check here and change the
    // typeguard to order is UniswapXOrder
    return (
      order.orderType === OrderType.Dutch ||
      order.orderType === OrderType.Limit ||
      order.orderType === OrderType.Dutch_V2
    )
  }
}
