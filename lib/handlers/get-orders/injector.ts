import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { SORT_FIELDS } from '../../entities'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { ApiInjector, ApiRInj } from '../base/index'
import { GetOrdersQueryParams } from './schema'

export interface RequestInjected extends ApiRInj {
  limit: number
  queryFilters: {
    orderStatus?: string
    orderHash?: string
    offerer?: string
    sortKey?: SORT_FIELDS
    sort?: string
    filler?: string
  }
  cursor?: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class GetOrdersInjector extends ApiInjector<ContainerInjected, RequestInjected, void, GetOrdersQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DynamoOrdersRepository.create(new DynamoDB.DocumentClient()),
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: GetOrdersQueryParams,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger
  ): Promise<RequestInjected> {
    const requestId = context.awsRequestId

    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
      requestId,
    })

    // default to no limit
    const limit = requestQueryParams?.limit ?? 0
    const orderStatus = requestQueryParams?.orderStatus
    const orderHash = requestQueryParams?.orderHash?.toLowerCase()
    const offerer = requestQueryParams?.offerer?.toLowerCase()
    const sortKey = requestQueryParams?.sortKey
    const defaultSort = sortKey ? 'gt(0)' : undefined
    const sort = requestQueryParams?.sort ?? defaultSort
    const filler = requestQueryParams?.filler
    const cursor = requestQueryParams?.cursor
    const date = requestQueryParams?.date

    return {
      limit: limit,
      queryFilters: {
        ...(orderStatus && { orderStatus: orderStatus }),
        ...(orderHash && { orderHash: orderHash }),
        ...(offerer && { offerer: offerer }),
        ...(sortKey && { sortKey: sortKey }),
        ...(filler && { filler: filler }),
        ...(sort && { sort: sort }),
        ...(date && { date: date }),
      },
      requestId,
      log,
      ...(cursor && { cursor: cursor }),
    }
  }
}
