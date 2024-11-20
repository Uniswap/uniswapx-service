import { MetricsLogger } from 'aws-embedded-metrics'
import { Context } from 'aws-lambda'
import bunyan, { default as Logger } from 'bunyan'
import { UniswapXOrderEntity } from '../../entities'
import { BaseOrdersRepository } from '../../repositories/base'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { GetOrdersQueryParams, RawGetOrdersQueryParams } from '../get-orders/schema'
import { GetOrderTypeQueryParamEnum } from '../get-orders/schema/GetOrderTypeQueryParamEnum'

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository<UniswapXOrderEntity>
}

export type GetRequestInjected = {
  limit: number
  queryFilters: GetOrdersQueryParams
  requestId: string
  log: Logger
  cursor?: string
}

type RequestInjectedParams = {
  containerInjected: ContainerInjected
  requestQueryParams: RawGetOrdersQueryParams
  context: Context
  log: Logger
  metrics: MetricsLogger
}

export function getSharedRequestInjected({
  containerInjected,
  requestQueryParams,
  context,
  log,
  metrics,
}: RequestInjectedParams): GetRequestInjected {
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

  return {
    ...parseGetQueryParams(requestQueryParams),
    requestId,
    log,
  }
}

export const parseGetQueryParams = (
  requestQueryParams: RawGetOrdersQueryParams
): { limit: number; queryFilters: GetOrdersQueryParams; cursor?: string; orderType?: string } => {
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
  const orderType =
    requestQueryParams?.orderType && requestQueryParams?.orderType in GetOrderTypeQueryParamEnum
      ? requestQueryParams?.orderType
      : undefined

  return {
    limit: limit,
    orderType,
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
    ...(cursor && { cursor: cursor }),
  }
}
