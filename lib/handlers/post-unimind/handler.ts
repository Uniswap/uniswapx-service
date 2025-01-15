import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { ExtrinsicValues } from '../../repositories/extrinsic-values-repository'
import { IntrinsicValues } from '../../repositories/intrinsic-values-repository'

type UnimindResponse = {
  pi: number
  tau: number
}

type UnimindRequest = ExtrinsicValues & {
  pair: string
}

export class PostUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, UnimindRequest, void, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, UnimindRequest, void>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    const { requestBody, containerInjected } = params
    const { extrinsicValuesRepository, intrinsicValuesRepository } = containerInjected

    const extrinsicValues : ExtrinsicValues = {
        quoteId: requestBody.quoteId,
        referencePrice: requestBody.referencePrice,
        priceImpact: requestBody.priceImpact
    }
    
    await extrinsicValuesRepository.put(extrinsicValues)
    
    const intrinsicValues = await intrinsicValuesRepository.getByPair(requestBody.pair)
    if (!intrinsicValues) {
      return {
        statusCode: 404,
        errorCode: ErrorCode.NoIntrinsicValuesFound,
        detail: `No intrinsic values found for ${requestBody.pair}`
      }
    }

    const parameters = this.calculateParameters(intrinsicValues, requestBody)

    return {
      statusCode: 200,
      body: parameters
    }
  }

  calculateParameters(intrinsicValues: IntrinsicValues, extrinsicValues: ExtrinsicValues): UnimindResponse {
    const pi = intrinsicValues.pi * extrinsicValues.priceImpact
    const tau = intrinsicValues.tau * extrinsicValues.priceImpact
    return {
      pi,
      tau
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      quoteId: Joi.string().required(),
      pair: Joi.string().required(),
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