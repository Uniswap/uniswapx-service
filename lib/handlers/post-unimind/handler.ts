import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { ExtrinsicValues } from '../../repositories/extrinsic-values-repository'
import { UnimindParameters } from '../../repositories/unimind-parameters-repository'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { metrics } from '../../util/metrics'

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
    const { extrinsicValuesRepository, unimindParametersRepository } = containerInjected

    const extrinsicValues : ExtrinsicValues = {
        quoteId: requestBody.quoteId,
        referencePrice: requestBody.referencePrice,
        priceImpact: requestBody.priceImpact,
        route: requestBody.route,
        pair: requestBody.pair
    }
    
    const [_, unimindParameters] = await Promise.all([
      extrinsicValuesRepository.put(extrinsicValues),
      unimindParametersRepository.getByPair(requestBody.pair)
    ])

    if (!unimindParameters) {
      return {
        statusCode: 404,
        errorCode: ErrorCode.NoUnimindParametersFound,
        detail: `No unimind parameters found for ${requestBody.pair}`
      }
    }

    const beforeCalculateTime = Date.now()
    const parameters = this.calculateParameters(unimindParameters, requestBody)
    const afterCalculateTime = Date.now()
    const calculateTime = afterCalculateTime - beforeCalculateTime
    metrics.putMetric(`extrinsic-calculation-time`, calculateTime)

    return {
      statusCode: 200,
      body: parameters
    }
  }

  calculateParameters(intrinsicValues: UnimindParameters, extrinsicValues: ExtrinsicValues): UnimindResponse {
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
      priceImpact: Joi.number().required(),
      route: Joi.object({
        quote: Joi.string().required(),
        quote_gas_adjusted: Joi.string().required(),
        gas_price_wei: Joi.string().required(),
        gas_use_estimate_quote: Joi.string().required(),
        gas_use_estimate: Joi.string().required(),
        method_parameters: Joi.object({
          calldata: Joi.string().required(),
          value: Joi.string().required(),
          to: Joi.string().required()
        }).required()
      }).required()
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

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the pair from the raw json
    let pair = 'unknown'
    try {
      const rawBody = JSON.parse(event.body!)
      pair = rawBody.pair ?? pair
    } catch (err) {
      // no-op. If we can't get pair still log the metric as unknown
    }

    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const postUnimindByPairMetricName = `PostUnimindPair${pair}Status${statusCodeMod}`
    metrics.putMetric(postUnimindByPairMetricName, 1, Unit.Count)

    const postUnimindMetricName = `PostUnimindStatus${statusCodeMod}`
    metrics.putMetric(postUnimindMetricName, 1, Unit.Count)

    const postUnimindRequestMetricName = `PostUnimindRequest`
    metrics.putMetric(postUnimindRequestMetricName, 1, Unit.Count)

    const postUnimindRequestByPairMetricName = `PostUnimindRequestPair${pair}`
    metrics.putMetric(postUnimindRequestByPairMetricName, 1, Unit.Count)
  }
} 