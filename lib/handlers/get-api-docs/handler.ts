import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import SWAGGER_UI from './swagger-ui'

export class GetApiDocsHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, void, string> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, void>
  ): Promise<ErrorResponse | Response<string>> {
    const {
      requestInjected: { log },
    } = params

    try {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
        },
        body: SWAGGER_UI,
      }
    } catch (e: unknown) {
      log.error({ e }, 'Error getting api docs json.')
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
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return Joi.object()
  }
}
