import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { QuoteMetadata } from '../../repositories/quote-metadata-repository'
import { UnimindParameters } from '../../repositories/unimind-parameters-repository'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { metrics } from '../../util/metrics'
import { UnimindQueryParams, unimindQueryParamsSchema } from './schema'
import { DEFAULT_UNIMIND_PARAMETERS, PUBLIC_UNIMIND_PARAMETERS } from '../../util/constants'
import { unimindAddressFilter } from '../../util/unimind'

type UnimindResponse = {
  pi: number
  tau: number
}

export class GetUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, UnimindQueryParams, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, UnimindQueryParams>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    const { containerInjected, requestQueryParams } = params
    const { quoteMetadataRepository, unimindParametersRepository } = containerInjected
    try {
      const { logOnly, swapper, ...quoteMetadataFields } = requestQueryParams
      const quoteMetadata = {
        ...quoteMetadataFields,
        route: requestQueryParams.route ? JSON.parse(requestQueryParams.route) : undefined
      }
      // For requests that don't expect params, we only save the quote metadata and return
      if (logOnly) { 
        try {
          quoteMetadata.usedUnimind = false
          await quoteMetadataRepository.put(quoteMetadata)
        } catch (error) {
          return {
            statusCode: 500,
            errorCode: ErrorCode.InternalError,
            detail: 'Failed to store quote metadata'
          }
        }
        return {
          statusCode: 200,
          body: {
            pi: 0,
            tau: 0
          }
        }
      }

      if (!swapper || !unimindAddressFilter(swapper)) {
        return {
            statusCode: 200,
            body: PUBLIC_UNIMIND_PARAMETERS
        }
      }

      // If we made it through these filters, then we are using Unimind to provide parameters
      quoteMetadata.usedUnimind = true

      let [, unimindParameters] = await Promise.all([
        quoteMetadataRepository.put(quoteMetadata),
        unimindParametersRepository.getByPair(requestQueryParams.pair)
      ])

      if (!unimindParameters) {
        // Use default parameters and add to unimindParametersRepository
        const entry = {
            intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
            pair: requestQueryParams.pair,
            count: 0
        }
        await unimindParametersRepository.put(entry)
        unimindParameters = entry
      }

      const beforeCalculateTime = Date.now()
      const parameters = this.calculateParameters(unimindParameters, quoteMetadata)
      // TODO: Add condition for not using Unimind with bad parameters
      const afterCalculateTime = Date.now()
      const calculateTime = afterCalculateTime - beforeCalculateTime
      metrics.putMetric(`final-parameters-calculation-time`, calculateTime)

      return {
        statusCode: 200,
        body: parameters
      }
    } catch (e) {
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        detail: (e as Error)?.message ?? 'Unknown error occurred'
      }
    }
  }

  calculateParameters(unimindParameters: UnimindParameters, extrinsicValues: QuoteMetadata): UnimindResponse {
    const intrinsicValues = JSON.parse(unimindParameters.intrinsicValues)
    // Keeping intrinsic extrinsic naming for consistency with algorithm
    const pi = intrinsicValues.lambda1 + intrinsicValues.lambda2 // random placeholder
    const tau = intrinsicValues.Sigma + extrinsicValues.priceImpact // random placeholder
    return {
      pi,
      tau
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema {
    return unimindQueryParamsSchema
  }

  protected responseBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      pi: Joi.number().required(),
      tau: Joi.number().required()
    })
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the pair from the query parameters
    let pair = 'unknown'
    try {
      const queryParams = event.queryStringParameters || {}
      pair = queryParams.pair ?? pair
    } catch (err) {
      // no-op. If we can't get pair still log the metric as unknown
    }

    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const getUnimindByPairMetricName = `GetUnimindPair${pair}Status${statusCodeMod}`
    metrics.putMetric(getUnimindByPairMetricName, 1, Unit.Count)

    const getUnimindMetricName = `GetUnimindStatus${statusCodeMod}`
    metrics.putMetric(getUnimindMetricName, 1, Unit.Count)

    const getUnimindRequestMetricName = `GetUnimindRequest`
    metrics.putMetric(getUnimindRequestMetricName, 1, Unit.Count)

    const getUnimindRequestByPairMetricName = `GetUnimindRequestPair${pair}`
    metrics.putMetric(getUnimindRequestByPairMetricName, 1, Unit.Count)
  }
}