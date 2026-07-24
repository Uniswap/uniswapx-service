import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Logger from 'bunyan'
import Joi from 'joi'
import { ONCHAIN_NONCE_CHECK_TIMEOUT_MS } from '../../util/constants'
import { metrics } from '../../util/metrics'
import { findUnusedNonce } from '../../util/nonce'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base/index'
import { ProviderMap } from '../shared'
import { ContainerInjected, RequestInjected } from './injector'
import { GetNonceQueryParams, GetNonceQueryParamsJoi, GetNonceResponse, GetNonceResponseJoi } from './schema/index'

export class GetNonceHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetNonceQueryParams,
  GetNonceResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, GetNonceQueryParams>
  ): Promise<ErrorResponse | Response<GetNonceResponse>> {
    const {
      requestInjected: { address, chainId, log },
      containerInjected: { dbInterface, providerMap },
    } = params

    try {
      log.info({ address: address }, 'Getting nonce for address')
      const lastUsedNonce = await dbInterface.getNonceByAddressAndChain(address.toLowerCase(), chainId)
      const nonce = await this.verifyNonceOnChain(lastUsedNonce, address, chainId, providerMap, log)
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
      if (!provider) {
        throw new Error(`no provider found for chainId: ${chainId}`)
      }
      return await Promise.race([
        findUnusedNonce(provider, chainId, address, lastUsedNonce),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('on-chain nonce check timed out')),
            ONCHAIN_NONCE_CHECK_TIMEOUT_MS
          )
        }),
      ])
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

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the chain id from the raw json.
    let chainId = '0'
    try {
      chainId = event.queryStringParameters?.chainId ?? '0'
    } catch (err) {
      // no-op. If we can't get chainId still log the metric as chain 0
    }

    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const getNonceStatusByChain = `GetNonceChainId${chainId.toString()}Status${statusCodeMod}`
    metrics.putMetric(getNonceStatusByChain, 1, Unit.Count)

    const getNonceStatus = `GetNonceStatus${statusCodeMod}`
    metrics.putMetric(getNonceStatus, 1, Unit.Count)

    const getNonceChainId = `GetNonceRequestChainId${chainId.toString()}`
    metrics.putMetric(getNonceChainId, 1, Unit.Count)

    const getNonce = `GetNonceRequest`
    metrics.putMetric(getNonce, 1, Unit.Count)
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
