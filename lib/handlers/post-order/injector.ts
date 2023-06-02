import { OrderValidator as OnchainValidator } from '@uniswap/gouda-sdk'
import { APIGatewayEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { OrderValidator } from '../../util/order-validator'
import { ApiInjector, ApiRInj } from '../base'
import { PostOrderRequestBody } from './schema'

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
  orderValidator: OrderValidator
  onchainValidatorByChainId: { [chainId: number]: OnchainValidator }
}

export class PostOrderInjector extends ApiInjector<ContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const onchainValidatorByChainId: { [chainId: number]: OnchainValidator } = {}
    SUPPORTED_CHAINS.forEach((chainId) => {
      if (typeof chainId === 'number') {
        const rpc = process.env[`RPC_${chainId}`]
        if (rpc) {
          onchainValidatorByChainId[chainId] = new OnchainValidator(new ethers.providers.JsonRpcProvider(rpc), chainId)
        }
      }
    })
    return {
      dbInterface: DynamoOrdersRepository.create(new DynamoDB.DocumentClient()),
      orderValidator: new OrderValidator(() => new Date().getTime() / 1000),
      onchainValidatorByChainId,
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger
  ): Promise<ApiRInj> {
    return {
      requestId: context.awsRequestId,
      log,
    }
  }
}
