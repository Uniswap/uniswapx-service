import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { MetricsLogger } from 'aws-embedded-metrics'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { DutchOrderEntity, ORDER_STATUS } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { setGlobalMetrics } from '../../util/metrics'
import { SfnInjector, SfnStateInputOutput } from '../base/index'
export interface RequestInjected {
  log: Logger
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
  orderType: OrderType
  stateMachineArn: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository<DutchOrderEntity>
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
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId)
    const quoter = new OrderValidator(provider, chainId)

    // TODO: use different reactor address for different order type
    if (!REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch]) {
      throw new Error(`No Reactor Address Defined in UniswapX SDK for chainId:${chainId}, orderType${OrderType.Dutch}`)
    }
    const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch] as string)

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
      orderType: event.orderType as OrderType,
      stateMachineArn: event.stateMachineArn as string,
    }
  }
}
