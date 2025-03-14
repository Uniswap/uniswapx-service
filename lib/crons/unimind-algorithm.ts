import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { DynamoUnimindParametersRepository } from '../repositories/unimind-parameters-repository'
import { UnimindParametersRepository } from '../repositories/unimind-parameters-repository'

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

  const repo = DynamoUnimindParametersRepository.create(new DynamoDB.DocumentClient())
  await updateParameters(repo, log, metrics)
}

export async function updateParameters(
  repo: UnimindParametersRepository, 
  log: Logger, 
  metrics?: MetricsLogger
): Promise<void> {
  const beforeUpdateTime = Date.now()

  const pair = '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123'
  await repo.put({
    pair,
    pi: 3.14,
    tau: Date.now() % 123,
  })
  log.info(`Unimind parameters for ${pair} updated`)
  metrics?.putMetric(`unimind-parameters-updated-${pair}`, 1, Unit.Count)
  
  const afterUpdateTime = Date.now()
  const updateTime = afterUpdateTime - beforeUpdateTime
  metrics?.putMetric(`unimind-parameters-update-time`, updateTime)
}
