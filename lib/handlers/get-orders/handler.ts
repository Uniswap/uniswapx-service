import Joi from 'joi'

import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, GetOrdersResponse, GetOrdersResponseJoi } from './schema/index'

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetOrdersQueryParams,
  GetOrdersResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, GetOrdersQueryParams>
  ): Promise<Response<GetOrdersResponse> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, cursor },
      containerInjected: { dbInterface },
    } = params

    try {
      // TODO: when the base handler is more generalized we should be able to include this logic in request validation
      if ((queryFilters.sortKey && !queryFilters.sort) || (!queryFilters.sortKey && queryFilters.sort)) {
        return {
          statusCode: 400,
          detail: 'Need both a sortKey and sort for a sorted query.',
          errorCode: 'VALIDATION_ERROR',
        }
      }

      const getOrdersResult = await dbInterface.getOrders(limit, queryFilters, cursor)

      return {
        statusCode: 200,
        body: getOrdersResult,
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
