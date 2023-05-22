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

    const chainId = event.chainId
    /// @dev When app stage is local or when running in beta on mainnet, use tenderly rpc to pass integration tests
    const rpcURL =
      process.env['stage'] == 'local' || (chainId == 1 && process.env['stage'] == 'beta')
        ? process.env['RPC_TENDERLY']
        : process.env[`RPC_${chainId}`]

    console.log('rpcURL', rpcURL)

    const provider = new ethers.providers.JsonRpcProvider(rpcURL)
    const quoter = new OrderValidator(provider, parseInt(chainId as string))
    // TODO: use different reactor address for different order type
    const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId as number][OrderType.DutchLimit])

    log.info({ quoterAddr: quoter.orderQuoterAddress }, 'getRequestInjected')
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
