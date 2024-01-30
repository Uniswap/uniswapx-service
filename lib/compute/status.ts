//@ts-nocheck
import { MetricUnits } from '@aws-lambda-powertools/metrics'
import awssdk from 'aws-sdk'
import { log } from '../Logging'
import { powertoolsMetric } from '../Metrics'
import { DynamoLimitOrdersRepository } from '../repositories/limit-orders-repository'
const { DynamoDB } = awssdk
const TEN_MINUTES_IN_SECONDS = 60 * 10
// const TWO_MINUTES_IN_SECONDS = 60 * 2
const LOOP_DELAY_MS = 600000 // ten minutes

/**
 * Order Fetcher
 * Fetches open Gouda orders and kicks of a state machine for order broadcasting.
 */
const BATCH_WRITE_MAX = 100
async function main() {
  const dbInterface = DynamoLimitOrdersRepository.create(new DynamoDB.DocumentClient())
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
    // let openOrders = await dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX)
    for (;;) {
      // metrics.addMetric(MetricName.OrderFetcherLoopStarted(), 1)
      try {
        // const loopStartTime = new Date().getTime()
        // log.warn('found open orders', { length: openOrders.orders.length })
        log.warn('found open orders')
        // if (openOrders.cursor) {
        //   openOrders = await dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX, openOrders.cursor)
        // } else {
        //   log.warn('breaking')
        //   break
        // }
      } catch (e: any) {
        log.error(`Unexpected error in status job`, { error: e })
        metrics.addMetric('Status loop error', MetricUnits.Count, 1)
      } finally {
        // metrics.publishStoredMetrics()
        // metrics.clearMetrics()
        log.warn('delaying')
        await delay(LOOP_DELAY_MS)
      }
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main()
