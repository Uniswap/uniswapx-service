import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { BaseOrdersRepository } from '../../repositories/base'
import { DynamoLimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { ApiInjector, ApiRInj } from '../base/index'
import { GetOrdersQueryParams, RawGetOrdersQueryParams } from '../get-orders/schema'

export interface RequestInjected extends ApiRInj {
  limit: number
  queryFilters: GetOrdersQueryParams
  cursor?: string
}

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
}

export class GetLimitOrdersInjector extends ApiInjector<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams
> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      dbInterface: DynamoLimitOrdersRepository.create(new DynamoDB.DocumentClient()),
    }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    _requestBody: void,
    requestQueryParams: RawGetOrdersQueryParams,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    const requestId = context.awsRequestId

    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
      requestId,
    })

    setGlobalLogger(log)

    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)

    // default to no limit
    const limit = requestQueryParams?.limit ?? 0
    const orderStatus = requestQueryParams?.orderStatus
    const orderHash = requestQueryParams?.orderHash?.toLowerCase()
    // externally we use swapper
    const offerer = requestQueryParams?.swapper?.toLowerCase()
    const sortKey = requestQueryParams?.sortKey
    const defaultSort = sortKey ? 'gt(0)' : undefined
    const sort = requestQueryParams?.sort ?? defaultSort
    const filler = requestQueryParams?.filler
    const cursor = requestQueryParams?.cursor
    const chainId = requestQueryParams?.chainId
    const desc = requestQueryParams?.desc
    const orderHashes = requestQueryParams?.orderHashes?.split(',').map((orderHash: string) => orderHash.toLowerCase())

    return {
      limit: limit,
      queryFilters: {
        ...(orderStatus && { orderStatus: orderStatus }),
        ...(orderHash && { orderHash: orderHash }),
        ...(offerer && { offerer: offerer.toLowerCase() }),
        ...(sortKey && { sortKey: sortKey }),
        ...(filler && { filler: filler.toLowerCase() }),
        ...(sort && { sort: sort }),
        ...(chainId && { chainId: chainId }),
        ...(desc !== undefined && { desc: desc }),
        ...(orderHashes && { orderHashes: [...new Set(orderHashes)] }),
      },
      requestId,
      log,
      ...(cursor && { cursor: cursor }),
    }
  }
}
