import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/gouda-sdk'
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
  lastBlockNumber: number
  orderStatus: string
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

    // for local environment, override mainnnet (chainId = 1) to Tenderly
    // otherwise, inheret contract addrs from SDK
    const chainId = event.chainId
    const provider = new ethers.providers.JsonRpcProvider(process.env[`RPC_${chainId}`])
    log.info(chainId);
    const quoter = new OrderValidator(provider, parseInt(chainId as string))
    log.info(REACTOR_ADDRESS_MAPPING[chainId as number][OrderType.DutchLimit]);
    // TODO: use different reactor address for different order type
    const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId as number][OrderType.DutchLimit])

    log.info({ quoter: quoter, watcher: watcher, quoterAddr: quoter.orderQuoterAddress }, 'getRequestInjected')
    return {
      log,
      chainId: event.chainId as number,
      orderHash: event.orderHash as string,
      quoteId: event.quoteId as string,
      lastBlockNumber: event.lastBlockNumber ? (event.lastBlockNumber as number) : 0,
      orderStatus: event.orderStatus as string,
      retryCount: event.retryCount ? (event.retryCount as number) : 0,
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
    }
  }
}
