import { Logger } from '@aws-lambda-powertools/logger'
import { MetricsLogger, Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { log } from '../../Logging'
import { SUPPORTED_CHAINS } from '../../util/chain'

// Where every API request's metrics go: the namespace and dimensions the alarms and dashboards read.
export const API_METRICS_NAMESPACE = 'Uniswap'
export const API_METRICS_DIMENSIONS = { Service: 'UniswapXService' }

export type RequestLogger = Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
export type RequestMetrics = Pick<MetricsLogger, 'putMetric' | 'setNamespace' | 'setDimensions'>

/** One API request's own logger and metrics, built before anything can reject the request. */
export interface RequestContext {
  requestId: string
  logger: RequestLogger
  metrics: RequestMetrics
}

/**
 * Builds the context for one request around the metrics logger metricScope handed it, with the
 * namespace and dimensions set before anything is recorded on it.
 */
export function buildRequestContext(requestId: string, metrics: RequestMetrics): RequestContext {
  metrics.setNamespace(API_METRICS_NAMESPACE)
  metrics.setDimensions(API_METRICS_DIMENSIONS)
  return {
    requestId,
    logger: log.createChild({ persistentLogAttributes: { requestId } }),
    metrics,
  }
}

/**
 * The request counters an API handler records once it has answered. `prefix` names them;
 * `chainIdFrom` is where the chain in their names comes from, read from the raw event since the
 * request may have been rejected before it was parsed. 'none' always counts under chain 0.
 */
export type RequestMetricsConfig = {
  prefix: string
  chainIdFrom: 'body' | 'query' | 'none'
}

export function emitRequestMetrics(
  metrics: Pick<RequestMetrics, 'putMetric'>,
  { prefix, chainIdFrom }: RequestMetricsConfig,
  event: APIGatewayProxyEvent,
  statusCode: number
): void {
  const chainId = requestChainId(event, chainIdFrom)
  const statusClass = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

  metrics.putMetric(`${prefix}ChainId${chainId}Status${statusClass}`, 1, Unit.Count)
  metrics.putMetric(`${prefix}Status${statusClass}`, 1, Unit.Count)
  metrics.putMetric(`${prefix}Request`, 1, Unit.Count)
  metrics.putMetric(`${prefix}RequestChainId${chainId}`, 1, Unit.Count)
}

// A supported chain named by the raw request, else 0. Query values are strings, so it is parsed.
function requestChainId(event: APIGatewayProxyEvent, chainIdFrom: RequestMetricsConfig['chainIdFrom']): number {
  let raw: unknown
  if (chainIdFrom === 'body') {
    try {
      raw = JSON.parse(event.body ?? '')?.chainId
    } catch {
      // unparseable body: chain 0
    }
  } else if (chainIdFrom === 'query') {
    raw = event.queryStringParameters?.chainId
  }
  const chainId = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN
  return SUPPORTED_CHAINS.includes(chainId) ? chainId : 0
}
