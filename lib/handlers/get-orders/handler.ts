import { DynamoDB } from 'aws-sdk'
import Joi from 'joi'

import { OrderEntity } from '../../entities'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { setupMockItemsInDb } from './post-orders-testing-file'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, GetOrdersResponse, GetOrdersResponseJoi } from './schema/index'

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetOrdersQueryParams,
  GetOrdersResponse
> {
  public async handleRequest(
    params: HandleRequestParams<ContainerInjected, RequestInjected, void, GetOrdersQueryParams>
  ): Promise<Response<any> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, log },
    } = params

    const documentClient = new DynamoDB.DocumentClient()
    const dbInterface = new DynamoOrdersRepository()
    DynamoOrdersRepository.initialize(documentClient)

    try {
      // THIS WILL BE REMOVED BEFORE PR MERGE
      await setupMockItemsInDb()

      const orders: (OrderEntity | undefined)[] = await dbInterface.getOrders(limit, queryFilters, log)
      return {
        statusCode: 200,
        body: { orders: orders },
      }
    } catch (e: unknown) {
      // TODO: differentiate between input errors and add logging if unknown is not type Error
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return GetOrdersQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetOrdersResponseJoi
  }
}
