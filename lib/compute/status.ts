import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDB } from 'aws-sdk'
import bunyan from 'bunyan'
import { ORDER_STATUS } from '../entities/Order.js'
import { powertoolsMetric } from '../Metrics.js'
import { DynamoLimitOrdersRepository } from '../repositories/limit-orders-repository.js'
const TEN_MINUTES_IN_SECONDS = 60 * 10
// const TWO_MINUTES_IN_SECONDS = 60 * 2
// const LOOP_DELAY_MS = 1000

/**
 * Order Fetcher
 * Fetches open Gouda orders and kicks of a state machine for order broadcasting.
 */
const BATCH_WRITE_MAX = 100
async function main() {
  let dbInterface = DynamoLimitOrdersRepository.create(new DynamoDB.DocumentClient())
  //   setGlobalLogger(
  //     new BunyanLogger(
  //       {
  //         name: 'LoaderBotLogs',
  //         serializers: stdSerializers,
  //         level: 'info',
  //         requestId: uuidv4(),
  //       },
  //       createLogger({
  //         name: 'LoaderBotLogsAnalytics',
  //         serializers: stdSerializers,
  //         level: 'info',
  //         requestId: uuidv4(),
  //       }),
  //       config.stage
  //     )
  //   )

  const log: any = bunyan.createLogger({
    name: 'TestCompute',
    serializers: bunyan.stdSerializers,
    level: 'info',
  })
  log.warn('hi')

  const metrics = powertoolsMetric
  // metrics.add(MetricNamespace.Uniswap)
  // metrics.addDimension(OrderFetcherMetricDimension)
  // setGlobalMetrics(metrics)
  // const fetcher: OrderFetcher = new GoudaApiOrderFetcher(config.goudaApiUrl)
  // const orderRelayer: OrderRelayer = new OrderSfnRelayer(config.region, config.orderStateMachineArn)

  // const orderHashCache = new NodeCache({
  //   stdTTL: TEN_MINUTES_IN_SECONDS,
  //   checkperiod: TWO_MINUTES_IN_SECONDS,
  // })

  // log.info({ config: config })
  for (;;) {
    let openOrders = await dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX)
    for (;;) {
      // metrics.addMetric(MetricName.OrderFetcherLoopStarted(), 1)
      try {
        // const loopStartTime = new Date().getTime()
        log.warn('found open orders', { length: openOrders.orders.length })
        if (openOrders.cursor) {
          openOrders = await dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX, openOrders.cursor)
        } else {
          log.warn('breaking')
          break
        }
      } catch (e: any) {
        log.error({ req: e.config.data }, `Unexpected error in status job: ${e}`)
        metrics.addMetric('Status loop error', MetricUnits.Count, 1)
      } finally {
        metrics.publishStoredMetrics()
        metrics.clearMetrics()
        await delay(TEN_MINUTES_IN_SECONDS)
      }
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main()
