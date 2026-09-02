import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { ApiInjector, ApiRInj } from '../base/index'
import { GetOrdersQueryParams, RawGetOrdersQueryParams } from '../get-orders/schema'
import { createReadPathDocumentClient } from '../shared/dynamo'
import { ContainerInjected, getSharedRequestInjected } from '../shared/get'
import { getLimitOrdersQueryCache } from './query-cache'

export interface RequestInjected extends ApiRInj {
  limit: number
  queryFilters: GetOrdersQueryParams
  cursor?: string
}

export class GetLimitOrdersInjector extends ApiInjector<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams
> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: LimitOrdersRepository.create(createReadPathDocumentClient(), getLimitOrdersQueryCache),
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: RawGetOrdersQueryParams,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    return getSharedRequestInjected({ containerInjected, requestQueryParams, log, metrics, context })
  }
}
