import { Metrics } from '@aws-lambda-powertools/metrics'
import { SERVICE_NAME } from '../bin/constants'

export const powertoolsMetric = new Metrics({ namespace: 'Uniswap', serviceName: SERVICE_NAME })

const OnChainStatusCheckerPrefix = 'OnChainStatusChecker-'
export const OnChainStatusCheckerMetricNames = {
  TotalProcessedOpenOrders: OnChainStatusCheckerPrefix + 'TotalProcessedOpenOrders',
  TotalOrderProcessingErrors: OnChainStatusCheckerPrefix + 'TotalOrderProcessingErrors',
  TotalLoopProcessingTime: OnChainStatusCheckerPrefix + 'TotalLoopProcessingTime',
  LoopError: OnChainStatusCheckerPrefix + 'LoopError',
}
