import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { SERVICE_NAME } from '../bin/constants'

export const powertoolsMetric = new Metrics({ namespace: 'Uniswap', serviceName: SERVICE_NAME })

const OnChainStatusCheckerPrefix = 'OnChainStatusChecker-'
export const OnChainStatusCheckerMetricNames = {
  TotalProcessedOpenOrders: OnChainStatusCheckerPrefix + 'TotalProcessedOpenOrders',
  TotalOrderProcessingErrors: OnChainStatusCheckerPrefix + 'TotalOrderProcessingErrors',
  TotalLoopProcessingTime: OnChainStatusCheckerPrefix + 'TotalLoopProcessingTime',
  LoopError: OnChainStatusCheckerPrefix + 'LoopError',
  LoopCompleted: OnChainStatusCheckerPrefix + 'LoopCompleted',
  LoopEnded: OnChainStatusCheckerPrefix + 'LoopEnded',
}

const CheckOrderStatusHandlerPrefix = 'CheckOrderStatusHandler-'
export const CheckOrderStatusHandlerMetricNames = {
  StepFunctionKickedOffCount: CheckOrderStatusHandlerPrefix + 'StepFunctionKickedOffCount',
  GetFromDynamoTime: CheckOrderStatusHandlerPrefix + 'GetFromDynamoTime',
  GetBlockNumberTime: CheckOrderStatusHandlerPrefix + 'GetBlockNumberTime',
  GetValidationTime: CheckOrderStatusHandlerPrefix + 'GetValidationTime',
  GetFillEventsTime: CheckOrderStatusHandlerPrefix + 'GetFillEventsTime',
}

export async function wrapWithTimerMetric<T>(promise: Promise<T>, metricName: string): Promise<T> {
  const start = Date.now()
  let result = await promise
  const end = Date.now()
  powertoolsMetric.addMetric(metricName, MetricUnits.Milliseconds, end - start)
  powertoolsMetric.publishStoredMetrics()
  return result
}
