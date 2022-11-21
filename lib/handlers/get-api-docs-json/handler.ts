import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import OPENAPI_SCHEMA from './schema'

export class GetApiDocsJsonHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  void,
  { [key: string]: any }
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, void>
  ): Promise<ErrorResponse | Response<{ [key: string]: any }>> {
    const {
      requestInjected: { log },
    } = params

    try {
      return {
        statusCode: 200,
        body: OPENAPI_SCHEMA,
        headers: {
          'Content-Type': 'text/plain',
        },
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
