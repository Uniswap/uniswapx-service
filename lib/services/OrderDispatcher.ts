import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../entities'
import { NoHandlerConfiguredError } from '../errors/NoHandlerConfiguredError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { GetOderTypeQueryParamEnum } from '../handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { GetRelayOrderResponse } from '../handlers/get-orders/schema/GetRelayOrderResponse'
import { log } from '../Logging'
import { Order } from '../models/Order'
import { RelayOrder } from '../models/RelayOrder'
import { UniswapXOrder } from '../models/UniswapXOrder'
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

  async getOrder(
    orderType: GetOderTypeQueryParamEnum,
    { params, limit, cursor }: { params: GetOrdersQueryParams; limit: number; cursor: string | undefined }
  ): Promise<
    GetOrdersResponse<UniswapXOrderEntity | GetDutchV2OrderResponse> | GetOrdersResponse<GetRelayOrderResponse>
  > {
    switch (orderType) {
      case GetOderTypeQueryParamEnum.Dutch_V1_V2:
        log.warn('**fetching dutch and dutch_v2')
        return await this.uniswapXService.getDutchV2AndDutchOrders(limit, params, cursor)
      case GetOderTypeQueryParamEnum.Relay:
        return await this.relayOrderService.getOrders(limit, params, cursor)
      case GetOderTypeQueryParamEnum.Dutch_V2:
        log.warn('**fetching dutch_v2')
        return await this.uniswapXService.getDutchV2Orders(limit, params, cursor)
      case GetOderTypeQueryParamEnum.Dutch:
        log.warn('**fetching dutch')
        return await this.uniswapXService.getDutchOrders(limit, params, cursor)
      case GetOderTypeQueryParamEnum.Limit:
        return await this.uniswapXService.getLimitOrders(limit, params, cursor)
      default:
        throw new Error('OrderDispatcher Not Implemented')
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
