import { Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import { ChainId } from '../../util/chains'
import { BaseRInj, Injector } from '../base/handler'
import { PostOrderRequestBody } from './schema'
import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../../config/supported-chains'

export interface RequestInjected extends BaseRInj {
  offerer: string
  sellToken: string
  sellAmount: string,
  deadline: number
  provider: ethers.providers.JsonRpcProvider,
  reactor: string,
  nonce: string,
  orderHash: string,
  startTime: number
}

export type ContainerDependencies = {
  provider: ethers.providers.JsonRpcProvider
}

export interface ContainerInjected {
  dependencies: {
    [chainId in ChainId]?: ContainerDependencies
  }
}

export class PostOrderInjector extends Injector<ContainerInjected, RequestInjected, PostOrderRequestBody, void> {
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
      const url = process.env[`RPC_${chainId.toString()}`]!
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
    requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    context: Context,
    log: Logger,
  ): Promise<RequestInjected> {
    const requestId = context.awsRequestId

    const encodedOrder = requestBody.encodedOrder as string

    // Cast to DutchLimitOrder so that we can get the sellToken field
    // input.token does not exist on iOrder
    const order = parseOrder(encodedOrder) as DutchLimitOrder
    const { deadline, offerer, reactor, startTime, input, nonce } = order.info
    const dependencies = containerInjected.dependencies[requestBody.chainId as ChainId]!

    return {
      requestId,
      log,
      deadline,
      offerer,
      sellToken: input.token,
      sellAmount: input.amount.toString(),
      reactor,
      startTime,
      nonce: nonce.toString(),
      orderHash: order.hash(),
      provider: dependencies.provider
    }
  }
}
