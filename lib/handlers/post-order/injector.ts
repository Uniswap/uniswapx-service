import { APIGatewayEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as Logger } from 'bunyan'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { BaseRInj, Injector } from '../base/handler'
import { PostOrderRequestBody } from './schema'
export interface ContainerInjected {
  dbInterface: DynamoOrdersRepository
}

export class PostOrderInjector extends Injector<ContainerInjected, BaseRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const documentClient = new DynamoDB.DocumentClient()
    const dbInterface = new DynamoOrdersRepository()
    DynamoOrdersRepository.initialize(documentClient)
    return {
      dbInterface,
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger
  ): Promise<BaseRInj> {
    return {
      requestId: context.awsRequestId,
      log,
    }
  }
}
