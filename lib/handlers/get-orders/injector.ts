import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as Logger } from 'bunyan'
import { DutchOrderEntity } from '../../entities'
import { BaseOrdersRepository } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { ApiInjector, ApiRInj } from '../base/index'
import { getSharedRequestInjected } from '../shared/get'
import { GetOrdersQueryParams, RawGetOrdersQueryParams } from './schema'

export interface RequestInjected extends ApiRInj {
  limit: number
  queryFilters: GetOrdersQueryParams
  cursor?: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository<DutchOrderEntity>
}

export class GetOrdersInjector extends ApiInjector<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DutchOrdersRepository.create(new DynamoDB.DocumentClient()),
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
