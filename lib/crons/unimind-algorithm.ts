import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { DynamoIntrinsicValuesRepository } from '../repositories/intrinsic-values-repository'
import { IntrinsicValuesRepository } from '../repositories/intrinsic-values-repository'

export const handler: ScheduledHandler = metricScope((metrics) => async (_event: EventBridgeEvent<string, void>) => {
  await main(metrics)
})

async function main(metrics: MetricsLogger) {
  metrics.setNamespace('Uniswap')
  metrics.setDimensions({ Service: 'UniswapXServiceCron' })
  const log: Logger = bunyan.createLogger({
    name: 'UnimindAlgorithm',
    serializers: bunyan.stdSerializers,
    level: 'info',
  })

  const repo = DynamoIntrinsicValuesRepository.create(new DynamoDB.DocumentClient())
  await updateIntrinsicValues(repo, log, metrics)
}

export async function updateIntrinsicValues(
  repo: IntrinsicValuesRepository, 
  log: Logger, 
  metrics?: MetricsLogger
): Promise<void> {
  const beforeUpdateTime = Date.now()

  const pair = 'ETH-USDC'
  await repo.put({
    pair,
    pi: 3.14,
    tau: Date.now() % 123,
  })
  log.info(`Intrinsic values for ${pair} updated`)
  metrics?.putMetric(`intrinsic-values-updated-${pair}`, 1, Unit.Count)
  
  const afterUpdateTime = Date.now()
  const updateTime = afterUpdateTime - beforeUpdateTime
  metrics?.putMetric(`intrinsic-values-update-time`, updateTime)
}
