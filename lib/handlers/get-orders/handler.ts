import Joi from 'joi'
import { BaseOrdersRepository } from '../../repositories/base'

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

    // TODO: when the base handler is more generalized we should be able to include this logic in request validation
    if ((queryFilters.sortKey || queryFilters.sort) && !(queryFilters.sortKey && queryFilters.sort)) {
      return {
        statusCode: 400,
        detail: 'Need both a sortKey and sort for a sorted query.',
        errorCode: 'VALIDATION_ERROR',
      }
    }


    if (queryFilters.orderHash) {
      return this.getByHash(dbInterface, queryFilters.orderHash);
    }



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

  private async getByHash(dbInterface: BaseOrdersRepository, orderHash: string) {
    try {
      const result = await dbInterface.getByHash(orderHash);

      if (!result) {
        return {
          statusCode: 404,
          detail: "Not found"
        }
      }
      return {
        statusCode: 200,
        body: { orders: [result] },
      }
    } catch (e) {
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
