import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
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
    const { extrinsicValuesRepository, intrinsicValuesRepository } = containerInjected

    await extrinsicValuesRepository.put(requestBody)
    const pair = 'ETH-USDC'
    
    const intrinsicValues = await intrinsicValuesRepository.getByPair(pair)
    if (!intrinsicValues) {
      return {
        statusCode: 404,
        errorCode: ErrorCode.NoIntrinsicValuesFound,
        detail: `No intrinsic values found for ${pair}`
      }
    }

    return {
      statusCode: 200,
      body: {
        pi: intrinsicValues.pi,
        tau: intrinsicValues.tau
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