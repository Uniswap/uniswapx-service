import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../entities'
import { NoHandlerConfiguredError } from '../errors/NoHandlerConfiguredError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { GetOrderTypeQueryParamEnum } from '../handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { GetPriorityOrderResponse } from '../handlers/get-orders/schema/GetPriorityOrderResponse'
import { GetRelayOrderResponse } from '../handlers/get-orders/schema/GetRelayOrderResponse'
import { Order } from '../models/Order'
import { RelayOrder } from '../models/RelayOrder'
import { UniswapXOrder } from '../models/UniswapXOrder'
import { RelayOrderService } from './RelayOrderService'
import { UniswapXOrderService } from './UniswapXOrderService'
import { GetDutchV3OrderResponse } from '../handlers/get-orders/schema/GetDutchV3OrderResponse'

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
    orderType: GetOrderTypeQueryParamEnum,
    { params, limit, cursor }: { params: GetOrdersQueryParams; limit: number; cursor: string | undefined }
  ): Promise<
    | GetOrdersResponse<
        UniswapXOrderEntity | GetDutchV2OrderResponse | GetDutchV3OrderResponse | GetPriorityOrderResponse
      >
    | GetOrdersResponse<GetRelayOrderResponse>
  > {
    switch (orderType) {
      case GetOrderTypeQueryParamEnum.Dutch_V1_V2:
        return await this.uniswapXService.getDutchV2AndDutchOrders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Relay:
        return await this.relayOrderService.getOrders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Dutch_V2:
        return await this.uniswapXService.getDutchV2Orders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Dutch_V3:
        return await this.uniswapXService.getDutchV3Orders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Dutch:
        return await this.uniswapXService.getDutchOrders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Priority:
        return await this.uniswapXService.getPriorityOrders(limit, params, cursor)
      case GetOrderTypeQueryParamEnum.Limit:
        return await this.uniswapXService.getLimitOrders(limit, params, cursor)
      default:
        throw new Error('OrderDispatcher Not Implemented')
    }
  }

  private isUniswapXOrder(order: Order): order is UniswapXOrder {
    return (
      order.orderType === OrderType.Dutch ||
      order.orderType === OrderType.Limit ||
      order.orderType === OrderType.Dutch_V2 ||
      order.orderType === OrderType.Dutch_V3 ||
      order.orderType === OrderType.Priority
    )
  }

  private isRelayOrder(order: Order): order is RelayOrder {
    return order.orderType === OrderType.Relay
  }
}
