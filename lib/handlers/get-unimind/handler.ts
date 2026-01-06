import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { QuoteMetadata } from '../../repositories/quote-metadata-repository'
import { UnimindParameters } from '../../repositories/unimind-parameters-repository'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { metrics } from '../../util/metrics'
import { UnimindQueryParams, unimindQueryParamsSchema } from './schema'
import { DEFAULT_UNIMIND_PARAMETERS, PUBLIC_STATIC_PARAMETERS, TradeType, UNIMIND_ALGORITHM_VERSION, UNIMIND_DEV_SWAPPER_ADDRESS, UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD, UNIMIND_MAX_TAU_BPS, USE_CLASSIC_PARAMETERS } from '../../util/constants'
import { IUnimindAlgorithm, supportedUnimindTokens, unimindTradeFilter } from '../../util/unimind'
import { PriceImpactIntrinsicParameters, PriceImpactStrategy } from '../../unimind/priceImpactStrategy'
import { validateParameters } from '../../crons/unimind-algorithm'

type UnimindResponse = {
  pi: number
  tau: number
  batchNumber: number
  algorithmVersion: number
}

export class GetUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, UnimindQueryParams, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, UnimindQueryParams>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    const { containerInjected, requestQueryParams, requestInjected } = params
    const { quoteMetadataRepository, unimindParametersRepository, analyticsService } = containerInjected
    const { log } = requestInjected
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
            ...USE_CLASSIC_PARAMETERS,
            batchNumber: -1,  // -1 since logOnly doesn't use Unimind
            algorithmVersion: -1
          }
        }
      }
      
      const onUnimindTokenList = supportedUnimindTokens(quoteMetadata.pair);

      if (onUnimindTokenList) {
        // Both tokens on list → ALWAYS use Unimind (no sampling)
        log.info({
          quoteId: quoteMetadata.quoteId,
          swapper,
          pair: quoteMetadata.pair,
          experiment: 'unimind_trade_ab',
          group: 'treatment',
          reason: 'both_tokens_on_unimind_list'
        }, 'Trade assigned to treatment group (both tokens on Unimind list)');
      } else {
        // Either one or both tokens NOT on list: apply sampling (2/3 Unimind, 1/3 control)
        if (!unimindTradeFilter(quoteMetadata.quoteId)) {
          // Assigned to control group (1/3)
          log.info({
            quoteId: quoteMetadata.quoteId,
            swapper,
            pair: quoteMetadata.pair,
            experiment: 'unimind_trade_ab',
            group: 'control',
            reason: 'not_on_unimind_list_sampled_out'
          }, 'Trade assigned to control group (tokens not on list, sampled out)');

          quoteMetadata.usedUnimind = false

          try {
            await quoteMetadataRepository.put(quoteMetadata)
          } catch (error) {
            log.error({ error, quoteId: quoteMetadata.quoteId }, 'Failed to store quote metadata for public parameters path')
          } // Don't signal failure when assigning public params while still attempting to persist metadata

          return {
            statusCode: 200,
            body: PUBLIC_STATIC_PARAMETERS
          }
        }

        // Assigned to treatment group (2/3)
        log.info({
          quoteId: quoteMetadata.quoteId,
          swapper,
          pair: quoteMetadata.pair,
          experiment: 'unimind_trade_ab',
          group: 'treatment',
          reason: 'not_on_unimind_list_sampled_in'
        }, 'Trade assigned to treatment group (tokens not on list, sampled in)');
      }

      // If we made it through these filters, then we are using Unimind to provide parameters
      quoteMetadata.usedUnimind = true

      if (swapper !== UNIMIND_DEV_SWAPPER_ADDRESS) {
        metrics.putMetric(`public-address-used-unimind`, 1)
        log.info(`Public address ${swapper} received Unimind parameters for pair: ${requestQueryParams.pair} on quoteId: ${quoteMetadata.quoteId}`)
      }

      let [, unimindParameters] = await Promise.all([
        quoteMetadataRepository.put(quoteMetadata),
        unimindParametersRepository.getByPair(requestQueryParams.pair)
      ])

      if (!unimindParameters || !validateParameters(unimindParameters, log)) { // This includes version check
        // Use default parameters and add to unimindParametersRepository
        const entry = {
            intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
            pair: requestQueryParams.pair,
            count: 0,
            version: UNIMIND_ALGORITHM_VERSION,
            batchNumber: 0,
            lastUpdatedAt: Math.floor(Date.now() / 1000)
        }
        await unimindParametersRepository.put(entry)
        unimindParameters = entry
      }

      const beforeCalculateTime = Date.now()
      const strategy = new PriceImpactStrategy()
      const parameters = calculateParameters(strategy, unimindParameters, quoteMetadata, log)
      // TODO: Add condition for not using Unimind with bad parameters
      const afterCalculateTime = Date.now()
      const calculateTime = afterCalculateTime - beforeCalculateTime
      metrics.putMetric(`final-parameters-calculation-time`, calculateTime)

      // Track pi values for distribution analysis
      metrics.putMetric(`UnimindPiValue`, parameters.pi, Unit.None)
      
      // Log pi values for all analysis in CloudWatch Logs Insights
      log.info({
        eventType: 'UnimindPiCalculated',
        pi: parameters.pi,
        tau: parameters.tau,
        batchNumber: parameters.batchNumber,
        algorithmVersion: parameters.algorithmVersion,
        pair: requestQueryParams.pair,
        quoteId: quoteMetadata.quoteId,
        priceImpact: quoteMetadata.priceImpact
      })
      
      // Log analytics event through the analytics service
      analyticsService.logUnimindResponse({
        pi: parameters.pi,
        tau: parameters.tau,
        batchNumber: parameters.batchNumber,
        algorithmVersion: parameters.algorithmVersion,
        quoteId: quoteMetadata.quoteId,
        pair: requestQueryParams.pair,
        swapper: swapper,
        priceImpact: quoteMetadata.priceImpact,
        referencePrice: quoteMetadata.referencePrice,
        route: quoteMetadata.route,
        tradeType: quoteMetadata.tradeType,
        onUnimindTokenList: onUnimindTokenList,
      })

      log.info(
        `For the pair ${requestQueryParams.pair} with price impact of ${quoteMetadata.priceImpact}, pi is ${parameters.pi} and tau is ${parameters.tau} (batch: ${parameters.batchNumber}, version: ${parameters.algorithmVersion}). The quoteId is ${quoteMetadata.quoteId}`
      )
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

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema {
    return unimindQueryParamsSchema
  }

  protected responseBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      pi: Joi.number().required(),
      tau: Joi.number().required(),
      batchNumber: Joi.number().required(),
      algorithmVersion: Joi.number().required()
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

export function calculateParameters(strategy: IUnimindAlgorithm<PriceImpactIntrinsicParameters>, unimindParameters: UnimindParameters, extrinsicValues: QuoteMetadata, log?: any): UnimindResponse {
  const intrinsicValues = JSON.parse(unimindParameters.intrinsicValues)
  
  // Guardrail 1: Disallow negative lambda2 values
  if (intrinsicValues.lambda2 < 0) {
    if (log) {
      log.info({
        eventType: 'UnimindGuardrailTriggered',
        guardrailType: 'lambda2_negative',
        lambda2: intrinsicValues.lambda2,
        pair: unimindParameters.pair,
        quoteId: extrinsicValues.quoteId,
        priceImpact: extrinsicValues.priceImpact
      }, `Unimind guardrail triggered: Lambda2 < 0 (${intrinsicValues.lambda2}), returning classic parameters`)
    }
    metrics.putMetric('UnimindGuardrailLambda2Negative', 1)
    return {
      ...USE_CLASSIC_PARAMETERS,
      batchNumber: unimindParameters.batchNumber,
      algorithmVersion: unimindParameters.version
    }
  }
  
  // Guardrail 2: Disallow large price impact
  if (extrinsicValues.priceImpact > UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD) {
    if (log) {
      log.info({
        eventType: 'UnimindGuardrailTriggered',
        guardrailType: 'price_impact_too_high',
        priceImpact: extrinsicValues.priceImpact,
        pair: unimindParameters.pair,
        quoteId: extrinsicValues.quoteId,
        lambda2: intrinsicValues.lambda2
      }, `Unimind guardrail triggered: Price impact > ${UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD}% (${extrinsicValues.priceImpact}%), returning classic parameters`)
    }
    metrics.putMetric('UnimindGuardrailPriceImpactHigh', 1)
    return {
      ...USE_CLASSIC_PARAMETERS,
      batchNumber: unimindParameters.batchNumber,
      algorithmVersion: unimindParameters.version
    }
  }

  // Guardrail 3: Temporarily disallow EXACT_OUTPUT through Unimind
  // TAPI calls it EXACT_INPUT, EXACT_OUTPUT instead of EXACT_IN, EXACT_OUT
  if (extrinsicValues.tradeType === TradeType.EXACT_OUTPUT) {
    if (log) {
      log.info({
        eventType: 'UnimindGuardrailTriggered',
        guardrailType: 'exact_out_not_allowed',
        tradeType: extrinsicValues.tradeType,
      }, 'Unimind guardrail triggered: EXACT_OUTPUT not allowed, returning classic parameters')
    }
    metrics.putMetric('UnimindGuardrailExactOutNotAllowed', 1)
    return {
      ...USE_CLASSIC_PARAMETERS,
      batchNumber: unimindParameters.batchNumber,
      algorithmVersion: unimindParameters.version
    }
  }

  // Keeping intrinsic extrinsic naming for consistency with algorithm
  const pi = strategy.computePi(intrinsicValues, extrinsicValues)
  // Ceiling tau at UNIMIND_MAX_TAU_BPS for safety
  const tau = Math.min(strategy.computeTau(intrinsicValues, extrinsicValues), UNIMIND_MAX_TAU_BPS)
  return {
    pi,
    tau,
    batchNumber: unimindParameters.batchNumber,
    algorithmVersion: unimindParameters.version
  }
}
