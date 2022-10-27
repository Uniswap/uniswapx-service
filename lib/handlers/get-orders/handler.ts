import Joi from '@hapi/joi'
import { DynamoDB } from 'aws-sdk'
import { DynamoOrdersInterface } from '../../db-interface/orders'
import { ORDERS_TABLE_NAME } from '../../util/db'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { Order } from '../types/order'
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
    const dynamoClient = new DynamoDB.DocumentClient()
    const dbInterface = new DynamoOrdersInterface(dynamoClient, ORDERS_TABLE_NAME)

    try {
      // THIS WILL BE REMOVED BEFORE PR MERGE
      await setupMockItemsInDb()

      const orders: Order[] = await dbInterface.getOrders(limit, queryFilters, log)
      return {
        statusCode: 200,
        body: { orders: orders },
      }
    } catch (e: any) {
      return {
        // TODO: differentiate between input errors
        statusCode: 500,
        errorCode: e.message,
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
