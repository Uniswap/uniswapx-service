import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { BaseRInj, SfnInjector, SfnStateInputOutput } from '../base/index'

export interface RequestInjected extends BaseRInj {
  chainId: number
  quoteId: string
  orderHash: string
  startingBlockNumber: number
  orderStatus: string
  getFillLogAttempts: number
  retryCount: number
  provider: ethers.providers.JsonRpcProvider
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

  public async getRequestInjected(event: SfnStateInputOutput, log: Logger): Promise<RequestInjected> {
    log = log.child({
      serializers: bunyan.stdSerializers,
    })

    const chainId = event.chainId
    const rpcURL = process.env[`RPC_${chainId}`]
    const provider = new ethers.providers.JsonRpcProvider(rpcURL)
    const quoter = new OrderValidator(provider, parseInt(chainId as string))
    // TODO: use different reactor address for different order type
    const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId as number][OrderType.Dutch])

    return {
      log,
      chainId: event.chainId as number,
      orderHash: event.orderHash as string,
      quoteId: event.quoteId as string,
      startingBlockNumber: event.startingBlockNumber ? (event.startingBlockNumber as number) : 0,
      orderStatus: event.orderStatus as string,
      getFillLogAttempts: event.getFillLogAttempts ? (event.getFillLogAttempts as number) : 0,
      retryCount: event.retryCount ? (event.retryCount as number) : 0,
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
    }
  }
}
