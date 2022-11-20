import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { EventWatcher, OrderValidator } from 'gouda-sdk'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { BaseRInj, SfnInjector, SfnStateInputOutput } from '../base/base'

export interface RequestInjected extends BaseRInj {
  chainId: number
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
    const documentClient = new DynamoDB.DocumentClient()
    const dbInterface = new DynamoOrdersRepository()
    DynamoOrdersRepository.initialize(documentClient)

    return {
      dbInterface,
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    event: SfnStateInputOutput,
    log: Logger
  ): Promise<RequestInjected> {
    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
    })

    const chainId = process.env['stage'] == 'local' ? 'TENDERLY' : event.chainId

    const provider = new ethers.providers.JsonRpcProvider(process.env[`WEB3_RPC_${chainId}`])
    const quoter = new OrderValidator(provider, parseInt(event.chainId as string), process.env[`QUOTER_${chainId}`])
    const watcher = new EventWatcher(provider, checkDefined(process.env[`REACTOR_${chainId}`]))

    return {
      log,
      chainId: event.chainId as number,
      orderHash: event.orderHash as string,
      lastBlockNumber: event.lastBlockNumber ? (event.lastBlockNumber as number) : 0,
      orderStatus: event.orderStatus as string,
      retryCount: event.retryCount ? (event.retryCount as number) : 0,
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
    }
  }
}
