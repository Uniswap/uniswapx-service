import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { EventWatcher, OrderValidator } from 'gouda-sdk'
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

    // for dev environment, always use Tenderly
    // for beta environment, override mainnnet (chainId = 1) to Tenderly
    let chainId
    if (process.env['stage'] == 'local') {
      chainId = 'TENDERLY'
    } else if (chainId == 1 && process.env['stage'] == 'beta') {
      chainId = 'TENDERLY'
    } else {
      chainId = event.chainId
    }

    const provider = new ethers.providers.JsonRpcProvider(process.env[`RPC_${chainId}`])
    const quoter = new OrderValidator(
      provider,
      parseInt(event.chainId as string),
      checkDefined(process.env[`QUOTER_${chainId}`])
    )
    const watcher = new EventWatcher(provider, checkDefined(process.env[`DL_REACTOR_${chainId}`]))

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
