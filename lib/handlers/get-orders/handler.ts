import Joi from 'joi'

import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
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
    params: HandleRequestParams<ContainerInjected, RequestInjected, void, GetOrdersQueryParams>
  ): Promise<Response<GetOrdersResponse> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, cursor },
      containerInjected: { dbInterface },
    } = params

    try {
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
