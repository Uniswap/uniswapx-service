import { MetricsLogger } from 'aws-embedded-metrics'
import { Context } from 'aws-lambda'
import bunyan, { default as Logger } from 'bunyan'
import { BaseOrdersRepository } from '../../repositories/base'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { RawGetOrdersQueryParams } from '../get-orders/schema'

export interface ContainerInjected {
  dbInterface: BaseOrdersRepository
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
}: RequestInjectedParams) {
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
