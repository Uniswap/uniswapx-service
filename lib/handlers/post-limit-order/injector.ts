import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { ApiInjector, ApiRInj } from '../base'
import { DEFAULT_MAX_OPEN_LIMIT_ORDERS, HIGH_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS_SWAPPERS } from '../constants'
import { ContainerInjected as PostOrderContainerInjected } from '../post-order/injector'
import { PostOrderRequestBody } from '../post-order/schema'

export class PostLimitOrderInjector extends ApiInjector<
  PostOrderContainerInjected,
  ApiRInj,
  PostOrderRequestBody,
  void
> {
  public async buildContainerInjected(): Promise<PostOrderContainerInjected> {
    return {
      cosigner: undefined,
      cosignerAddress: undefined,
    }
  }

  public async getRequestInjected(
    _containerInjected: unknown,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<ApiRInj> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)

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
