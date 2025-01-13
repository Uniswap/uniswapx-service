import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { ExtrinsicValues } from '../../repositories/extrinsic-values-repository'

type UnimindResponse = {
  pi: number
  tau: number
}

type UnimindRequest = ExtrinsicValues

export class PostUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, UnimindRequest, void, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, UnimindRequest, void>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    const { requestBody, containerInjected } = params
    const { extrinsicValuesRepository } = containerInjected

    await extrinsicValuesRepository.put(requestBody)

    return {
      statusCode: 200,
      body: {
        pi: 3.14,
        tau: 5
      }
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      quoteId: Joi.string().required(),
      referencePrice: Joi.string().required(),
      priceImpact: Joi.number().required()
    })
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      pi: Joi.number().required(),
      tau: Joi.number().required()
    })
  }
} 