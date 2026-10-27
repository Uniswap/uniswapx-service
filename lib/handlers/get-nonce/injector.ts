import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { NonceRepository } from '../../repositories/nonce-repository'
import { ChainId } from '../../util/chain'
import { ApiInjector, ApiRInj } from '../base/index'
import type { ProviderMap } from '../shared'
import { GetNonceQueryParams } from './schema/index'

/**
 * Resolves providers only at request time. Importing `../shared` eagerly would pull in
 * lib/Config, whose module-load fail-fast (`buildConfig()` under AWS_LAMBDA_FUNCTION_NAME)
 * throws when RPC_PREFIX_URL is unset — which would fail this lambda at module init and
 * 500 every request before the handler's fallback could run. GET /nonce must instead
 * degrade to the stored-nonce fallback, so the shared LazyProviderMap (and with it
 * lib/Config) is require()d lazily inside get(); any resolution error thrown here is
 * caught by `verifyNonceOnChain`, which logs, emits `GetNonceOnChainCheckFallback`, and
 * returns the DB nonce. Other lambdas import Config at module load on purpose
 * (fail-fast at cold start) and are unaffected.
 */
export class RequestTimeProviderMap implements ProviderMap {
  private delegate: ProviderMap | undefined

  get(chainId: ChainId): StaticJsonRpcProvider {
    if (!this.delegate) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LazyProviderMap } = require('../shared') as typeof import('../shared')
      this.delegate = new LazyProviderMap()
    }
    return this.delegate.get(chainId)
  }
}

export interface RequestInjected extends ApiRInj {
  address: string
  chainId: number
}

export interface ContainerInjected {
  dbInterface: Pick<NonceRepository, 'getNonceByAddressAndChain'>
  providerMap: ProviderMap
}

export class GetNonceInjector extends ApiInjector<ContainerInjected, RequestInjected, void, GetNonceQueryParams> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: NonceRepository.create(new DynamoDB.DocumentClient()),
      providerMap: new RequestTimeProviderMap(),
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: GetNonceQueryParams,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger
  ): Promise<RequestInjected> {
    const requestId = context.awsRequestId

    log = log.child({
      serializers: bunyan.stdSerializers,
      requestId,
    })

    return {
      log,
      requestId,
      address: requestQueryParams.address,
      chainId: requestQueryParams.chainId ?? 1,
    }
  }
}
