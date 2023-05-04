import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { ApiInjector, ApiRInj } from '../base/index'

export type RequestInjected = ApiRInj

export interface ContainerInjected {
  [n: string]: never
}

export class GetDocsInjector extends ApiInjector<ContainerInjected, RequestInjected, void, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
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

    return {
      requestId,
      log,
    }
  }
}
