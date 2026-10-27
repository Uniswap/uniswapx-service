import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { ApiInjector, ApiRInj } from '../base'
import { DEFAULT_MAX_OPEN_LIMIT_ORDERS, HIGH_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS_SWAPPERS } from '../constants'
import { PostOrderRequestBody } from '../post-order/schema'
import { ContainerInjected as PostContainerInjected } from '../shared/post'

export class PostLimitOrderInjector extends ApiInjector<PostContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<PostContainerInjected> {
    return {}
  }

  public async getRequestInjected(
    _containerInjected: PostContainerInjected,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger
  ): Promise<ApiRInj> {
    return {
      requestId: context.awsRequestId,
      log,
    }
  }
}

export function getMaxLimitOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_LIMIT_ORDERS
}
