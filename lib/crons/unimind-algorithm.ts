import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { DynamoUnimindParametersRepository } from '../repositories/unimind-parameters-repository'
import { UnimindParametersRepository } from '../repositories/unimind-parameters-repository'
import { DEFAULT_UNIMIND_PARAMETERS, UNIMIND_UPDATE_THRESHOLD } from '../util/constants'
import { UNIMIND_ALGORITHM_CRON_INTERVAL } from '../../bin/constants'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import { UniswapXOrderEntity } from '../entities'
import { SORT_FIELDS } from '../entities'
import { OrderType } from '@uniswap/uniswapx-sdk'

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

  const unimindParametersRepo = DynamoUnimindParametersRepository.create(new DynamoDB.DocumentClient())
  const ordersRepo = DutchOrdersRepository.create(new DynamoDB.DocumentClient()) as DutchOrdersRepository
  await updateParameters(unimindParametersRepo, ordersRepo, log, metrics)
}

export async function updateParameters(
  unimindParametersRepo: UnimindParametersRepository,
  ordersRepo: DutchOrdersRepository,
  log: Logger, 
  metrics?: MetricsLogger
): Promise<void> {
  const beforeUpdateTime = Date.now()
  //Query the table for last 15 minutes of data
  const recentOrders = await getOrdersByTimeRange(ordersRepo, UNIMIND_ALGORITHM_CRON_INTERVAL);
  const recentOrderCounts = getOrderCountsByPair(recentOrders);
  // iterate over the map and update the parameters
  for (const [pair, count] of recentOrderCounts.entries()) {
    // Get the pair from the unimind parameters table
    const pairData = await unimindParametersRepo.getByPair(pair);

    if (!pairData) { // We haven't seen this pair before, so it must have received the default parameters
      await unimindParametersRepo.put({
        pair,
        pi: DEFAULT_UNIMIND_PARAMETERS.pi,
        tau: DEFAULT_UNIMIND_PARAMETERS.tau,
        count
      })
    } else { // We have seen this pair before, check if we need to update the parameters
      const totalCount = pairData.count + count;
      if (totalCount >= UNIMIND_UPDATE_THRESHOLD) {
        // Update the parameters
        // Query for the last totalCount instances of this pair in the orders table

      }
    }

    log.info(`Unimind parameters for ${pair} updated with ${recentOrders.length} recent orders`)
    metrics?.putMetric(`unimind-parameters-updated-${pair}`, 1, Unit.Count)  
  }

  const afterUpdateTime = Date.now()
  const updateTime = afterUpdateTime - beforeUpdateTime
  metrics?.putMetric(`unimind-parameters-update-time`, updateTime)
}

export async function getOrdersByTimeRange(ordersRepo: DutchOrdersRepository, timeRange: number): Promise<UniswapXOrderEntity[]> {
  // Calculate the timestamp from timeRange minutes ago
  const timeRangeMs = timeRange * 60 * 1000 // convert minutes to milliseconds
  const cutoffTime = Math.floor((Date.now() - timeRangeMs) / 1000) // Convert to seconds for DDB

  // Query Dutch V3 orders created after the cutoff time
  const result = await ordersRepo.getOrdersFilteredByType(
    2000, // reasonable limit for processing
    {
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: `gt(${cutoffTime})`,
      desc: true,
      chainId: 42161,
    },
    [OrderType.Dutch_V3], // Only get Dutch V3 orders
    undefined // no cursor needed for this query
  )

  return result.orders
}

// Aggregates orders by trading pair and returns a map of pair to count
function getOrderCountsByPair(
  orders: UniswapXOrderEntity[]
): Map<string, number> {
  const pairCounts = new Map<string, number>();

  for (const order of orders) {
    let pair = order.pair;
    // If pair is not already set, create it from input and output tokens
    if (!pair && order.input && order.outputs && order.outputs.length > 0) {
      const inputToken = order.input.token;
      const outputToken = order.outputs[0].token;
      pair = [inputToken, outputToken].join('-');
    }
    
    if (!pair) continue;

    pair = `${pair}-${order.chainId}`;
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
  }
  
  return pairCounts;
}