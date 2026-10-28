import { UniswapXOrderEntity } from '../entities'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { GetOrderTypeQueryParamEnum } from '../handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { GetPriorityOrderResponse } from '../handlers/get-orders/schema/GetPriorityOrderResponse'
import { UniswapXOrderService } from './UniswapXOrderService'
import { GetDutchV3OrderResponse } from '../handlers/get-orders/schema/GetDutchV3OrderResponse'

export class OrderDispatcher {
  constructor(private readonly uniswapXService: UniswapXOrderService) {}

  async getOrder(
    orderType: GetOrderTypeQueryParamEnum,
    { params, limit, cursor }: { params: GetOrdersQueryParams; limit: number; cursor: string | undefined }
  ): Promise<
    GetOrdersResponse<
      UniswapXOrderEntity | GetDutchV2OrderResponse | GetDutchV3OrderResponse | GetPriorityOrderResponse
    >
  > {
    switch (orderType) {
      case GetOrderTypeQueryParamEnum.Dutch_V1_V2:
        return await this.uniswapXService.getDutchV2AndDutchOrders(limit, params, cursor)
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
}
