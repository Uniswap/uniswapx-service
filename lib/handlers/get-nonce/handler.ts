import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base/index'
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
      requestInjected: { address, chainId, log },
      containerInjected: { dbInterface },
    } = params

    try {
      log.info({ address: address }, 'Getting nonce for address')
      const nonce = await dbInterface.getNonceByAddressAndChain(address, chainId)
      return {
        statusCode: 200,
        body: {
          nonce: nonce,
        },
      }
    } catch (e: unknown) {
      log.error({ e }, `Error getting nonce for address ${address} on chain ${chainId}`)
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
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
