import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { ApiInjector, ApiRInj } from '../base'
import { MetricsLogger } from 'aws-embedded-metrics'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'

export type RequestInjected = ApiRInj
export type ContainerInjected = Record<string, never>

export class PostUnimindInjector extends ApiInjector<ContainerInjected, RequestInjected, void, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: void,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)
    return { requestId: context.awsRequestId, log }
  }
}
