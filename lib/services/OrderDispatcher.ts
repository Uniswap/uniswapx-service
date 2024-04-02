import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { NoHandlerConfiguredError } from '../errors/NoHandlerConfiguredError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { Order } from '../models/Order'
import { RelayOrder } from '../models/RelayOrder'
import { UniswapXOrder } from '../models/UniswapXOrder'
import { OrderEntityType, QueryResult } from '../repositories/base'
import { RelayOrderService } from './RelayOrderService'
import { UniswapXOrderService } from './UniswapXOrderService'

export class OrderDispatcher {
  constructor(
    private readonly uniswapXService: UniswapXOrderService,
    private readonly relayOrderService: RelayOrderService,
    private readonly logger: Logger
  ) {}

  createOrder(order: Order): Promise<string> {
    if (this.isUniswapXOrder(order)) {
      return this.uniswapXService.createOrder(order)
    } else if (this.isRelayOrder(order)) {
      return this.relayOrderService.createOrder(order)
    }

    this.logger.error(`No createOrder handler configured for orderType: ${order.orderType}!`)
    // When a RelayOrderService is configured, add the additional check here.
    throw new NoHandlerConfiguredError(order.orderType)
  }

  async getOrder<T extends OrderEntityType>(
    orderType: OrderType,
    { params, limit, cursor }: { params: GetOrdersQueryParams; limit: number; cursor: string | undefined }
  ): Promise<QueryResult<T>> {
    switch (orderType) {
      case OrderType.Relay:
        return (await this.relayOrderService.getOrders(limit, params, cursor)) as QueryResult<T>
      case OrderType.Dutch:
      case OrderType.Dutch_V2:
      case OrderType.Limit:
      case undefined:
        throw new Error('Not Implemented')
    }
  }

  private isUniswapXOrder(order: Order): order is UniswapXOrder {
    return (
      order.orderType === OrderType.Dutch ||
      order.orderType === OrderType.Limit ||
      order.orderType === OrderType.Dutch_V2
    )
  }

  private isRelayOrder(order: Order): order is RelayOrder {
    return order.orderType === OrderType.Relay
  }
}
