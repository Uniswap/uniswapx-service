import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import { BaseRInj, Injector } from '../base/handler'
import { PostOrderRequestBody } from './schema'

export interface RequestInjected extends BaseRInj {
  offerer: string
  sellToken: string
  deadline: number
}

export interface ContainerInjected {}

export class PostOrderInjector extends Injector<ContainerInjected, RequestInjected, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
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
    const encodedOrder = requestBody.encodedOrder as string

    // Cast to DutchLimitOrder so that we can get the sellToken field
    // input.token does not exist on iOrder
    const order = parseOrder(encodedOrder) as DutchLimitOrder
    const { deadline, offerer, input } = order.info

    return {
      requestId,
      log,
      deadline,
      offerer,
      sellToken: input.token
    }
  }
}
