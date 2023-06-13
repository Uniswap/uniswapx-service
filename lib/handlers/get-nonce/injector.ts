import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { ApiInjector, ApiRInj } from '../base/index'
import { GetNonceQueryParams } from './schema/index'

export interface RequestInjected extends ApiRInj {
  address: string
  chainId: number
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class GetNonceInjector extends ApiInjector<ContainerInjected, RequestInjected, void, GetNonceQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DynamoOrdersRepository.create(new DynamoDB.DocumentClient()),
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: GetNonceQueryParams,
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
      log,
      requestId,
      address: requestQueryParams.address,
      chainId: requestQueryParams.chainId ?? 1,
    }
  }
}
