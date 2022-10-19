import Joi from '@hapi/joi'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { Order } from '../types/order'
import { ContainerInjected, RequestInjected } from './injector'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, GetOrdersResponse, GetOrdersResponseJoi } from './schema/index'
// import { getOrders } from '../db-requests';

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetOrdersQueryParams,
  GetOrdersResponse
> {
  public async handleRequest(
    _params: HandleRequestParams<ContainerInjected, RequestInjected, void, GetOrdersQueryParams>
  ): Promise<Response<any> | ErrorResponse> {
    try {
      // const {
      //   requestInjected: {
      //     limit,
      //     orderStatus,
      //     orderHash,
      //     creator,
      //     sellToken,
      //     chainId,
      //     buyToken,
      //     deadline,
      //     log,
      //   },
      // } = params;
      const orders: Order[] = []
      // const orders: Order[] = await getOrders(
      //   limit,
      //   { orderStatus, orderHash, creator, sellToken, chainId, buyToken, deadline },
      //   log
      // );

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
