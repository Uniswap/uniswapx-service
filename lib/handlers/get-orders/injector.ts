import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
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
}

export interface ContainerInjected {}

export class GetOrdersInjector extends Injector<ContainerInjected, RequestInjected, void, GetOrdersQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
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
    const orderHash = requestQueryParams?.orderHash
    const offerer = requestQueryParams?.offerer
    const sellToken = requestQueryParams?.sellToken

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
    }
  }
}
