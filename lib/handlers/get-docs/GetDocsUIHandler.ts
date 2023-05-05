import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './GetDocsInjector'
import SWAGGER_UI from './swagger-ui'

export class GetDocsUIHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, void, void> {
  public async handleRequest(
    _params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, void>
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
