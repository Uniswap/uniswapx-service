import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'

type UnimindResponse = {
  pi: number
  tau: number
}

export class PostUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, void, UnimindResponse> {
  public async handleRequest(
    _params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, void>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    return {
      statusCode: 200,
      body: {
        pi: 3.14,
        tau: 5
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