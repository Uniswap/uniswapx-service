import Joi from 'joi'
import swagger from '../../../swagger.json'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorCode, ErrorResponse, Response } from '../base/index'

export class GetDocsHandler extends APIGLambdaHandler<ApiRInj, void, void, object> {
  protected buildRequestInjected(base: ApiRInj): ApiRInj {
    return base
  }

  public async handleRequest(
    params: APIHandleRequestParams<ApiRInj, void, void>
  ): Promise<ErrorResponse | Response<object>> {
    const {
      requestInjected: { log },
    } = params

    try {
      return {
        statusCode: 200,
        body: swagger,
      }
    } catch (e: unknown) {
      log.error({ e }, 'Error getting api docs json.')
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
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return null
  }
}
