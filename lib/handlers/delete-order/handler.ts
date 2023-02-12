import Joi from 'joi'

import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import { DeleteOrderQueryParams, DeleteOrderQueryParamsJoi } from './schema/index'

export class DeleteOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  DeleteOrderQueryParams,
  null
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, DeleteOrderQueryParams>
  ): Promise<Response<null> | ErrorResponse> {
    const {
      requestInjected: { orderHash, log },
      containerInjected: { dbInterface },
    } = params

    try {
      const deleteOrderResult = await dbInterface.deleteOrderByHash(orderHash)
      log.info({ dynamoResult: deleteOrderResult }, 'delete order result')

      return {
        statusCode: 200,
        body: null,
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
    return DeleteOrderQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return null
  }
}
