import { Unit } from 'aws-embedded-metrics'
import Logger from 'bunyan'
import Joi from 'joi'
import { NonceRepository } from '../../repositories/nonce-repository'
import { ONCHAIN_NONCE_CHECK_TIMEOUT_MS } from '../../util/constants'
import { metrics } from '../../util/metrics'
import { findUnusedNonce, generateRandomNonce } from '../../util/nonce'
import {
  APIGLambdaHandler,
  APIHandleRequestParams,
  ApiRInj,
  ErrorCode,
  ErrorResponse,
  RequestMetricsConfig,
  Response,
} from '../base/index'
import type { ProviderMap } from '../shared'
import { GetNonceQueryParams, GetNonceQueryParamsJoi, GetNonceResponse, GetNonceResponseJoi } from './schema/index'

export interface RequestInjected extends ApiRInj {
  address: string
  chainId: number
}

export class GetNonceHandler extends APIGLambdaHandler<RequestInjected, void, GetNonceQueryParams, GetNonceResponse> {
  constructor(
    handlerName: string,
    private readonly nonceRepository: Pick<NonceRepository, 'getNonceByAddressAndChain'>,
    private readonly providerMap: ProviderMap
  ) {
    super(handlerName)
  }

  protected buildRequestInjected(
    base: ApiRInj,
    _requestBody: void,
    requestQueryParams: GetNonceQueryParams
  ): RequestInjected {
    return {
      ...base,
      address: requestQueryParams.address,
      chainId: requestQueryParams.chainId ?? 1,
    }
  }

  public async handleRequest(
    params: APIHandleRequestParams<RequestInjected, void, GetNonceQueryParams>
  ): Promise<ErrorResponse | Response<GetNonceResponse>> {
    const {
      requestInjected: { address, chainId, log },
    } = params

    try {
      log.info({ address: address }, 'Getting nonce for address')
      const lastUsedNonce = await this.nonceRepository.getNonceByAddressAndChain(address.toLowerCase(), chainId)
      if (lastUsedNonce === undefined) {
        // Never-seen address: a fresh random nonce lands on an untouched 248-bit word, so the
        // chance of an on-chain collision is negligible — skip the RPC check entirely.
        return {
          statusCode: 200,
          body: {
            nonce: generateRandomNonce(),
          },
        }
      }
      const nonce = await this.verifyNonceOnChain(lastUsedNonce, address, chainId, this.providerMap, log)
      return {
        statusCode: 200,
        body: {
          nonce: nonce,
        },
      }
    } catch (e: unknown) {
      log.error({ e }, `Error getting nonce for address ${address} on chain ${chainId}`)
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
      }
    }
  }

  /**
   * The stored nonce only advances when an order is posted through this service, so it can be
   * stale if a nonce was consumed on-chain via another path. Verify the candidate against the
   * on-chain Permit2 nonceBitmap and skip past any consumed values. Falls back to the stored
   * nonce if the check cannot complete, rather than failing the request.
   */
  private async verifyNonceOnChain(
    lastUsedNonce: string,
    address: string,
    chainId: number,
    providerMap: ProviderMap,
    log: Logger
  ): Promise<string> {
    let timeout: NodeJS.Timeout | undefined = undefined
    try {
      const provider = providerMap.get(chainId)
      const adjustedNonce = await Promise.race([
        findUnusedNonce(provider, chainId, address, lastUsedNonce),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('on-chain nonce check timed out')),
            ONCHAIN_NONCE_CHECK_TIMEOUT_MS
          )
        }),
      ])
      if (adjustedNonce !== lastUsedNonce) {
        log.info(
          { address, chainId, storedNonce: lastUsedNonce, adjustedNonce },
          'On-chain nonce check advanced past the stored nonce'
        )
        metrics.putMetric('GetNonceOnChainAdvance', 1, Unit.Count)
      }
      return adjustedNonce
    } catch (e: unknown) {
      log.warn({ e, address, chainId }, 'On-chain nonce check failed; falling back to stored nonce')
      metrics.putMetric('GetNonceOnChainCheckFallback', 1, Unit.Count)
      return lastUsedNonce
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }

  // Counted under the chainId the query names, so a request without one is chain 0 although the
  // handler serves chain 1.
  protected requestMetricsConfig(): RequestMetricsConfig {
    return { prefix: 'GetNonce', chainIdFrom: 'query' }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return GetNonceQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetNonceResponseJoi
  }
}
