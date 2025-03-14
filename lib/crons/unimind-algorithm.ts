import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { DynamoUnimindParametersRepository, UnimindParameters } from '../repositories/unimind-parameters-repository'
import { UnimindParametersRepository } from '../repositories/unimind-parameters-repository'
import { DEFAULT_UNIMIND_PARAMETERS, UNIMIND_UPDATE_THRESHOLD } from '../util/constants'
import { UNIMIND_ALGORITHM_CRON_INTERVAL } from '../../bin/constants'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import { DutchV3OrderEntity, ORDER_STATUS, SORT_FIELDS, UniswapXOrderEntity } from '../entities'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { QueryResult } from '../repositories/base'

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
  // Query Orders table for latest orders
  const recentOrders = await getOrdersByTimeRange(ordersRepo, UNIMIND_ALGORITHM_CRON_INTERVAL);
  log.info(`Found ${recentOrders.length} orders in the last ${UNIMIND_ALGORITHM_CRON_INTERVAL} minutes`)
  const recentOrderCounts = getOrderCountsByPair(recentOrders);
  log.info(`Found ${recentOrderCounts.size} unique pairs in the last ${UNIMIND_ALGORITHM_CRON_INTERVAL} minutes`)
  for (const [pairKey, count] of recentOrderCounts.entries()) {
    // Get the pair from the unimind parameters table
    const pairData = await unimindParametersRepo.getByPair(pairKey);
    if (!pairData) { // We haven't seen this pair before, so it must have received the default parameters
      log.info(`No parameters found for pair ${pairKey}, updating with default parameters`)
      await unimindParametersRepo.put({
        pair: pairKey,
        pi: DEFAULT_UNIMIND_PARAMETERS.pi,
        tau: DEFAULT_UNIMIND_PARAMETERS.tau,
        count
      })
    } else { // We have seen this pair before, check if we need to update the parameters
      const totalCount = pairData.count + count;
      if (totalCount >= UNIMIND_UPDATE_THRESHOLD) {
        log.info(`Total count for pair ${pairKey} is greater than or equal to ${UNIMIND_UPDATE_THRESHOLD}, updating parameters`)
        // Update the parameters
        // Query for the last totalCount instances of this pair in the orders table
        const pairOrders = await ordersRepo.getOrdersFilteredByType(totalCount, {
            sortKey: SORT_FIELDS.CREATED_AT,
            sort: `lt(${Math.floor(Date.now()/1000)})`, // required field to get it to sort descending
            desc: true,
            pair: pairKey
          },
          [OrderType.Dutch_V3], 
          undefined // no cursor needed
        ) as QueryResult<DutchV3OrderEntity>
        log.info(`Found ${pairOrders.orders.length} orders for pair ${pairKey}`)
        const statistics = getStatistics(pairOrders.orders)
        const updatedParameters = unimindAlgorithm(statistics, pairData)
        log.info(`Updated parameters for pair ${pairKey} are ${updatedParameters}`)
        await unimindParametersRepo.put({
          pair: pairKey,
          pi: updatedParameters.pi,
          tau: updatedParameters.tau,
          count: 0
        })
        log.info(
          `Unimind parameters for ${pairKey} updated from ${pairData.pi} and ${pairData.tau} 
          to ${updatedParameters.pi} and ${updatedParameters.tau} based on ${totalCount} recent orders`
        )
        metrics?.putMetric(`unimind-parameters-updated-${pairKey}`, 1, Unit.Count)  
      } else {
        log.info(`Total count for pair ${pairKey} is less than ${UNIMIND_UPDATE_THRESHOLD}, not updating parameters`)
        // Update the count
        await unimindParametersRepo.put({
          pair: pairKey,
          pi: pairData.pi,
          tau: pairData.tau,
          count: totalCount
        })
      }
    }
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
    [OrderType.Dutch_V3],
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
    if (!pair && order.input && order.outputs) {
      const inputToken = order.input.token;
      const outputToken = order.outputs[0].token;
      pair = `${inputToken}-${outputToken}-${order.chainId}`;
    }
    
    if (!pair) continue;

    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
  }
  
  return pairCounts;
}

interface UnimindStatistics {
  waitTime: number[];
  fillStatus: number[];
  priceImpact: number[];
}

function getStatistics(orders: DutchV3OrderEntity[]): UnimindStatistics {
  const waitTime = orders.map(order => {
    if (!order.fillBlock || !order.cosignerData.decayStartBlock) return -1;
    return order.fillBlock - order.cosignerData.decayStartBlock;
  })
  const fillStatus = orders.map(order => order.orderStatus === ORDER_STATUS.FILLED ? 1 : 0)
  const priceImpact = orders.map(order => order.priceImpact ? order.priceImpact : -1)
  return {
    waitTime,
    fillStatus,
    priceImpact
  };
}

function unimindAlgorithm(statistics: UnimindStatistics, pairData: UnimindParameters) {
  const objective_wait_time = 2;
  const objective_fill_rate = 0.95;
  const learning_rate = 2;
  const auction_duration = 32;
  const previousParameters = pairData;
  const average_wait_time = statistics.waitTime.reduce((a, b) => a + (b === -1 ? auction_duration : b), 0) / statistics.waitTime.length;
  const average_fill_rate = statistics.fillStatus.reduce((a, b) => a + b, 0) / statistics.fillStatus.length;
  
  const wait_time_proportion = (objective_wait_time - average_wait_time) / objective_wait_time;
  const fill_rate_proportion = (objective_fill_rate - average_fill_rate) / objective_fill_rate;

  const pi = previousParameters.pi + learning_rate * wait_time_proportion;
  const tau = previousParameters.tau + learning_rate * fill_rate_proportion;

  return {
    pi,
    tau,
  };
}