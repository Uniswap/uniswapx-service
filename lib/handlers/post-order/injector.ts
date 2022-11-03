import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import { BaseRInj, Injector } from '../base/handler'
import { PostOrderRequestBody } from './schema'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { ChainId, SUPPORTED_CHAINS } from '../../util/chain'

export interface RequestInjected extends BaseRInj {
  offerer: string
  sellToken: string
  sellAmount: string,
  deadline: number
  reactor: string,
  nonce: string,
  orderHash: string,
  startTime: number,
}

// No deps yet!
// eslint-disable-next-line @typescript-eslint/ban-types
export type ContainerDependencies = {}

export interface ContainerInjected {
  dependencies: {
    [chainId in ChainId]?: ContainerDependencies
  }
  dbInterface: DynamoOrdersRepository
}

export class PostOrderInjector extends Injector<ContainerInjected, RequestInjected, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const dependenciesByChain: {
      [chainId in ChainId]?: ContainerDependencies
    } = {}
    for(let i=0; i<SUPPORTED_CHAINS.length; i++) {
      dependenciesByChain[SUPPORTED_CHAINS[i]] = {}
    }
    return { dependencies: dependenciesByChain, dbInterface: new DynamoOrdersRepository() }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
  ): Promise<RequestInjected> {
    const requestId = context.awsRequestId

    const encodedOrder = requestBody.encodedOrder as string

    // Cast to DutchLimitOrder so that we can get the sellToken field
    // input.token does not exist on iOrder
    const order = parseOrder(encodedOrder) as DutchLimitOrder
    const { deadline, offerer, reactor, startTime, input, nonce } = order.info

    return {
      requestId,
      log,
      deadline,
      offerer,
      sellToken: input.token,
      sellAmount: input.amount.toString(),
      reactor,
      startTime,
      nonce: nonce.toString(),
      orderHash: order.hash(),
    }
  }
}
