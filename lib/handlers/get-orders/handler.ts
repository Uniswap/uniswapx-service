import Joi from 'joi'

import { OrderEntity } from '../../entities'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { setupMockItemsInDb } from './post-order-testing'
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

    if (limit == 999) {
      await setupMockItemsInDb()
    }

    try {
      // TODO: when the base handler is more generalized we should be able to include this logic in request validation
      if ((queryFilters.sortKey || queryFilters.sort) && !(queryFilters.sortKey && queryFilters.sort)) {
        return {
          statusCode: 400,
          detail: 'Need both a sortKey and sort for a sorted query.',
          errorCode: 'VALIDATION_ERROR',
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
