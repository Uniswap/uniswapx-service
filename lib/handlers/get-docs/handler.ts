import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import swagger from '../../../swagger.json'

export class GetDocsHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  void,
  object
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, void>
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
    return null
  }
}
