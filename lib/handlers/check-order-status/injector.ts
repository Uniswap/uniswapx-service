import { Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../../config/supported-chains'
import { ChainId } from '../../util/chains'
import { BaseRInj, Injector } from '../base/handler'
import { CheckOrderStatusQueryParams } from './handler'

export interface CheckOrderStatusRequestInjected extends BaseRInj {
  provider: ethers.providers.JsonRpcProvider
  blockNumber: number
}

export type ContainerDependencies = {
  provider: ethers.providers.JsonRpcProvider
  /*
  ####################################################
  # providers we could potentially use in the future #
  ####################################################
  v3SubgraphProvider: IV3SubgraphProvider
  v2SubgraphProvider: IV2SubgraphProvider
  tokenListProvider: ITokenListProvider
  gasPriceProvider: IGasPriceProvider
  tokenProviderFromTokenList: ITokenProvider
  blockedTokenListProvider: ITokenListProvider
  v3PoolProvider: IV3PoolProvider
  v2PoolProvider: IV2PoolProvider
  tokenProvider: ITokenProvider
  multicallProvider: UniswapMulticallProvider
  onChainQuoteProvider?: OnChainQuoteProvider
  v2QuoteProvider: V2QuoteProvider
  simulator: ISimulator
  */
}

export interface ContainerInjected {
  dependencies: {
    [chainId in ChainId]?: ContainerDependencies
  }
}

export class CheckOrderStatusInjector extends Injector<
  ContainerInjected,
  CheckOrderStatusRequestInjected,
  null,
  CheckOrderStatusQueryParams
> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const log: Logger = bunyan.createLogger({
      name: this.injectorName,
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
    })
    const dependenciesByChain: {
      [chainId in ChainId]?: ContainerDependencies
    } = {}
    for(let i=0; i<SUPPORTED_CHAINS.length; i++) {
      const chainId = SUPPORTED_CHAINS[i]
      const url = process.env[`RPC_URL_${chainId.toString()}`]!
      if (!url) {
        log.error(`Fatal: No RPC endpoint set`)
      }

      let timeout: number
      switch (chainId) {
        case ChainId.ARBITRUM_ONE:
        case ChainId.ARBITRUM_RINKEBY:
          timeout = 8000
          break
        default:
          timeout = 5000
          break
      }

      const provider = new ethers.providers.JsonRpcProvider(
        {
          url: url,
          timeout,
        },
        chainId
      )

      dependenciesByChain[chainId] = { provider }
    }
    return { dependencies: dependenciesByChain }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: null,
    requestQueryParams: CheckOrderStatusQueryParams,
    _event: any,
    context: Context,
    log: Logger
  ): Promise<CheckOrderStatusRequestInjected> {
    const requestId = context.awsRequestId
    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
      requestId,
    })
    const dependencies = containerInjected.dependencies[requestQueryParams.chainId]!
    const blockNumber = await dependencies.provider.getBlockNumber()
    return {
      provider: dependencies.provider,
      blockNumber,
      requestId,
      log,
    }
  }
}
