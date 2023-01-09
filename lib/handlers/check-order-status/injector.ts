import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from 'gouda-sdk'
import { checkDefined } from '../../preconditions/preconditions'
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

    // for beta environment, override mainnnet (chainId = 1) to Tenderly
    // otherwise, inheret contract addrs from SDK
    let chainId, quoter, watcher, provider
    if (process.env['stage'] == 'local' || (chainId == 1 && process.env['stage'] == 'beta')) {
      chainId = 'TENDERLY'
      provider = new ethers.providers.JsonRpcProvider(process.env[`RPC_${chainId}`])
      quoter = new OrderValidator(
        provider,
        parseInt(event.chainId as string),
        checkDefined(process.env[`QUOTER_${chainId}`])
      )
      watcher = new EventWatcher(provider, checkDefined(process.env[`DL_REACTOR_${chainId}`]))
    } else {
      chainId = event.chainId
      provider = new ethers.providers.JsonRpcProvider(process.env[`RPC_${chainId}`])
      quoter = new OrderValidator(provider, parseInt(event.chainId as string))
      // TODO: use different reactor address for different order type
      watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId as number][OrderType.DutchLimit])
    }

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
