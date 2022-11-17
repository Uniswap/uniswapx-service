import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { GetNonceQueryParams, GetNonceQueryParamsJoi, GetNonceResponse, GetNonceResponseJoi } from './schema/index'

export class GetNonceHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetNonceQueryParams,
  GetNonceResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, GetNonceQueryParams>
  ): Promise<ErrorResponse | Response<GetNonceResponse>> {
    const {
      requestInjected: { address, log },
      containerInjected: { dbInterface },
    } = params

    try {
      const nonce = await dbInterface.getNonceByAddress(address)
      return {
        statusCode: 200,
        body: {
          nonce: nonce,
        },
      }
    } catch (e: unknown) {
      log.error({ e }, 'Error getting nonce')
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
    return GetNonceQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetNonceResponseJoi
  }
}
