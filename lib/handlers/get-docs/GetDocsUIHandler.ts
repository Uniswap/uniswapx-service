import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/index'
import SWAGGER_UI from './swagger-ui'

export class GetDocsUIHandler extends APIGLambdaHandler<ApiRInj, void, void, void> {
  protected buildRequestInjected(base: ApiRInj): ApiRInj {
    return base
  }

  public async handleRequest(
    _params: APIHandleRequestParams<ApiRInj, void, void>
  ): Promise<Response<any> | ErrorResponse> {
    try {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
        },
        body: SWAGGER_UI,
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
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return null
  }
}
