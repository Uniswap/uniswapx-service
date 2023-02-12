import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { ApiInjector, ApiRInj } from '../base/index'
import { DeleteOrderQueryParams } from './schema'

export interface RequestInjected extends ApiRInj {
  orderHash: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class DeleteOrderInjector extends ApiInjector<ContainerInjected, RequestInjected, void, DeleteOrderQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DynamoOrdersRepository.create(new DynamoDB.DocumentClient()),
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: DeleteOrderQueryParams,
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

    const orderHash = requestQueryParams?.orderHash

    return {
      orderHash,
      requestId,
      log,
    }
  }
}
