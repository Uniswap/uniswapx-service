import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'

import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { ORDER_STATUS } from '../entities'
import { BaseOrdersRepository } from '../repositories/base'
import { DynamoOrdersRepository } from '../repositories/orders-repository'
import { ONE_HOUR_IN_SECONDS } from '../util/constants'

export const BATCH_WRITE_MAX = 25

export const handler: ScheduledHandler = metricScope((metrics) => async (_event: EventBridgeEvent<string, void>) => {
  await main(metrics)
})

async function main(metrics: MetricsLogger) {
  metrics.setNamespace('Uniswap')
  metrics.setDimensions({ Service: 'UniswapXServiceCron' })
  const log: Logger = bunyan.createLogger({
    name: 'DynamoReaperCron',
    serializers: bunyan.stdSerializers,
    level: 'info',
  })
  const repo = DynamoOrdersRepository.create(new DynamoDB.DocumentClient())
  await deleteStaleOrders(repo, log, metrics)
}

export async function deleteStaleOrders(
  repo: BaseOrdersRepository,
  log: Logger,
  metrics?: MetricsLogger
): Promise<void> {
  let openOrders = await repo.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX)
  for (;;) {
    // get orderHashes with deadlines more than 1 hour ago and are still 'open'
    const staleOrders = openOrders.orders.flatMap((order) => {
      if (order.deadline < Date.now() / 1000 - ONE_HOUR_IN_SECONDS) {
        return order.orderHash
      }
      return []
    })
    log.info({ staleOrders }, `Found ${staleOrders.length} stale orders`)
    if (staleOrders.length > 0) {
      try {
        await repo.deleteOrders(staleOrders)
      } catch (e) {
        metrics?.putMetric('DeleteStaleOrdersError', 1, Unit.Count)
        log.error({ error: e }, 'Failed to delete stale orders')
        throw e
      }
    }
    if (openOrders.cursor) {
      openOrders = await repo.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX, openOrders.cursor)
    } else {
      break
    }
  }
}
