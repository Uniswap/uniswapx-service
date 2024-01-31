import { OrderValidator as OnchainValidator } from '@uniswap/uniswapx-sdk'
import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { BaseOrdersRepository } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { OrderValidator } from '../../util/order-validator'
import { ApiInjector, ApiRInj } from '../base'
import { DEFAULT_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS_SWAPPERS } from '../constants'
import { PostOrderRequestBody } from './schema'

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
  orderValidator: OrderValidator
  onchainValidatorByChainId: { [chainId: number]: OnchainValidator }
  // return the number of open orders the given offerer is allowed to have at a time
  getMaxOpenOrders: (offerer: string) => number
}

export class PostOrderInjector extends ApiInjector<ContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const onchainValidatorByChainId: { [chainId: number]: OnchainValidator } = {}
    SUPPORTED_CHAINS.forEach((chainId) => {
      if (typeof chainId === 'number') {
        const rpc = process.env[`RPC_${chainId}`]
        if (rpc) {
          onchainValidatorByChainId[chainId] = new OnchainValidator(
            new ethers.providers.StaticJsonRpcProvider(rpc),
            chainId
          )
        }
      }
    })
    return {
      dbInterface: DutchOrdersRepository.create(new DynamoDB.DocumentClient()),
      orderValidator: new OrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS),
      onchainValidatorByChainId,
      getMaxOpenOrders,
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<ApiRInj> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)

    return {
      requestId: context.awsRequestId,
      log,
    }
  }
}

export function getMaxOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_ORDERS
}
