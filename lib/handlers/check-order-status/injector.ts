import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { MetricsLogger } from 'aws-embedded-metrics'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { ORDER_STATUS } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { setGlobalMetrics } from '../../util/metrics'
import { BaseRInj, SfnInjector, SfnStateInputOutput } from '../base/index'

export interface RequestInjected extends BaseRInj {
  chainId: number
  quoteId: string
  orderHash: string
  startingBlockNumber: number
  orderStatus: ORDER_STATUS
  getFillLogAttempts: number
  retryCount: number
  provider: ethers.providers.StaticJsonRpcProvider
  orderWatcher: EventWatcher
  orderQuoter: OrderValidator
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class CheckOrderStatusInjector extends SfnInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DynamoOrdersRepository.create(new DynamoDB.DocumentClient()),
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
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId)
    const quoter = new OrderValidator(provider, chainId)
    // TODO: use different reactor address for different order type
    const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch])

    return {
      log,
      chainId: event.chainId as number,
      orderHash: event.orderHash as string,
      quoteId: event.quoteId as string,
      startingBlockNumber: event.startingBlockNumber ? (event.startingBlockNumber as number) : 0,
      orderStatus: event.orderStatus as ORDER_STATUS,
      getFillLogAttempts: event.getFillLogAttempts ? (event.getFillLogAttempts as number) : 0,
      retryCount: event.retryCount ? (event.retryCount as number) : 0,
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
    }
  }
}
