import Joi from 'joi'

import { OrderEntity } from '../../entities'
import { getRequestedParams } from '../../util/request'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { setupMockItemsInDb } from './post-orders-testing'
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
  ): Promise<Response<GetOrdersResponse> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters },
      containerInjected: { dbInterface },
    } = params

    try {
      if (limit == 999) {
        await setupMockItemsInDb()
        console.log('Put items in db!')
      }

      if (queryFilters.sortKey || queryFilters.sort) {
        if (!(queryFilters.sortKey && queryFilters.sort)) {
          return {
            statusCode: 400,
            detail: 'Need both a sortKey and sort in order to query with sorting.',
            errorCode: 'VALIDATION_ERROR',
          }
        }
        if (getRequestedParams(queryFilters).length == 0) {
          return {
            statusCode: 400,
            detail: "Can't query sort without additional query params.",
            errorCode: 'VALIDATION_ERROR',
          }
        }
      }

      const orders: (OrderEntity | undefined)[] = await dbInterface.getOrders(limit, queryFilters)
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
