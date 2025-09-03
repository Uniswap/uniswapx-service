import { OrderType, OrderValidator, UniswapXEventWatcher } from '@uniswap/uniswapx-sdk'
import { MetricsLogger } from 'aws-embedded-metrics'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { setGlobalMetrics } from '../../util/metrics'
import { SfnInjector, SfnStateInputOutput } from '../base/index'
import { getWatcher } from './util'
import { RPC_HEADERS } from '../../util/constants'

export interface RequestInjected {
  log: Logger
  chainId: number
  quoteId: string
  orderHash: string
  startingBlockNumber: number
  orderStatus: ORDER_STATUS
  getFillLogAttempts: number
  retryCount: number
  runIndex: number
  provider: ethers.providers.StaticJsonRpcProvider
  orderWatcher: UniswapXEventWatcher
  orderQuoter: OrderValidator
  orderType: OrderType
  stateMachineArn: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository<UniswapXOrderEntity>
}

export class CheckOrderStatusInjector extends SfnInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DutchOrdersRepository.create(new DynamoDB.DocumentClient()),
    }
  }

  public async getRequestInjected(
    event: SfnStateInputOutput,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)

    log = log.child({
      serializers: bunyan.stdSerializers,
    })

    const chainId = checkDefined(event.chainId, 'chainId not defined') as number
    const rpcURL = process.env[`RPC_${chainId}`]
    if (!rpcURL) {
      throw new Error(`RPC_${chainId} not set`)
    }
    const provider = new ethers.providers.StaticJsonRpcProvider({
      url: rpcURL,
      headers: RPC_HEADERS
    }, chainId)
    const quoter = new OrderValidator(provider, chainId)
    const orderType = event.orderType as OrderType

    const watcher = getWatcher(provider, chainId, orderType)

    return {
      log,
      chainId: event.chainId as number,
      orderHash: event.orderHash as string,
      quoteId: event.quoteId as string,
      startingBlockNumber: event.startingBlockNumber ? (event.startingBlockNumber as number) : 0,
      orderStatus: event.orderStatus as ORDER_STATUS,
      getFillLogAttempts: event.getFillLogAttempts ? (event.getFillLogAttempts as number) : 0,
      retryCount: event.retryCount ? (event.retryCount as number) : 0,
      runIndex: event.runIndex ? (event.runIndex as number) : 0,
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
      orderType: orderType,
      stateMachineArn: event.stateMachineArn as string,
    }
  }
}
