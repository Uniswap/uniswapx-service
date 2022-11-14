import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { BaseRInj, Injector } from '../base/handler'
import { GetOrdersQueryParams } from './schema'

export interface RequestInjected extends BaseRInj {
  limit: number
  queryFilters: {
    orderStatus?: string
    orderHash?: string
    offerer?: string
    sellToken?: string
  }
  cursor?: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class GetOrdersInjector extends Injector<ContainerInjected, RequestInjected, void, GetOrdersQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const documentClient = new DynamoDB.DocumentClient()
    const dbInterface = new DynamoOrdersRepository()
    DynamoOrdersRepository.initialize(documentClient)
    return {
      dbInterface,
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
    const sellToken = requestQueryParams?.sellToken?.toLowerCase()
    const cursor = requestQueryParams?.cursor

    return {
      limit: limit,
      queryFilters: {
        ...(orderStatus && { orderStatus: orderStatus }),
        ...(orderHash && { orderHash: orderHash }),
        ...(offerer && { offerer: offerer }),
        ...(sellToken && { sellToken: sellToken }),
      },
      requestId,
      log,
      ...(cursor && { cursor: cursor }),
    }
  }
}
