import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { BaseRInj, Injector } from '../base/handler'
import { GetOrdersQueryParams } from './schema'

export interface RequestInjected extends BaseRInj {
  limit: number
  orderStatus?: string
  orderHash?: string
  creator?: string
  sellToken?: string
  buyToken?: string
  chainId?: number
  deadline?: string
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
    const creator = requestQueryParams?.creator
    const sellToken = requestQueryParams?.sellToken
    const chainId = requestQueryParams?.chainId
    const buyToken = requestQueryParams?.buyToken
    const deadline = requestQueryParams?.deadline

    return {
      limit: limit,
      orderStatus: orderStatus,
      orderHash: orderHash,
      creator: creator,
      sellToken: sellToken,
      buyToken: buyToken,
      chainId: chainId,
      deadline: deadline,
      requestId,
      log,
    }
  }
}
