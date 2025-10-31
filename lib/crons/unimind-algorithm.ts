import { ChainId } from '@uniswap/sdk-core'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { UNIMIND_ALGORITHM_CRON_INTERVAL } from '../../bin/constants'
import { DutchV3OrderEntity, ORDER_STATUS, SORT_FIELDS, UniswapXOrderEntity } from '../entities'
import { QueryResult } from '../repositories/base'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import {
  DynamoUnimindParametersRepository,
  UnimindParameters,
  UnimindParametersRepository,
} from '../repositories/unimind-parameters-repository'
import { AnalyticsService } from '../services/analytics-service'
import { PriceImpactStrategy } from '../unimind/priceImpactStrategy'
import {
  DEFAULT_UNIMIND_PARAMETERS,
  UnimindUpdateType,
  UNIMIND_ALGORITHM_VERSION,
  UNIMIND_UPDATE_THRESHOLD,
} from '../util/constants'
import { median } from '../util/unimind'

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
  const analyticsService = AnalyticsService.create()
  await updateParameters(unimindParametersRepo, ordersRepo, log, metrics, analyticsService)
}

/**
 * @notice Updates Unimind parameters for trading pairs based on recent order performance
 * @dev Process flow:
 * 1. Fetches orders from the previous interval period
 * 2. Groups orders by trading pair
 * 3. For each active pair:
 *    a. If pair doesn't exist in parameters store, initializes with default values
 *    b. If pair exists but order count < threshold, increments count only
 *    c. If pair reaches threshold count, runs unimindAlgorithm to calculate new parameters
 *       based on historical performance and resets count
 *
 * This implements a batch learning approach where parameters are only updated after
 * collecting sufficient data points
 * @param unimindParametersRepo Repository for storing and retrieving pair parameters
 * @param ordersRepo Repository for accessing the Orders table
 * @param log Logger instance
 * @param metrics Optional metrics logger for monitoring
 */
export async function updateParameters(
  unimindParametersRepo: UnimindParametersRepository,
  ordersRepo: DutchOrdersRepository,
  log: Logger,
  metrics?: MetricsLogger,
  analyticsService?: AnalyticsService
): Promise<void> {
  const beforeUpdateTime = Date.now()
  // Query Orders table for latest orders
  const unimindOrders = await getUnimindOrdersByTimeRange(ordersRepo, UNIMIND_ALGORITHM_CRON_INTERVAL, log)
  const unimindOrderHashes = unimindOrders.map((order) => order.orderHash)
  log.info(
    `Unimind updateParameters: Found ${unimindOrders.length} orders in the last ${UNIMIND_ALGORITHM_CRON_INTERVAL} minutes.`
  )
  if (unimindOrderHashes.length > 0) {
    log.info(`Unimind updateParameters: Unimind order hashes: ${unimindOrderHashes.join(', ')}`)
  }
  const recentOrderCounts = getOrderCountsByPair(unimindOrders)
  log.info(
    `Unimind updateParameters: Found ${recentOrderCounts.size} unique pairs in the last ${UNIMIND_ALGORITHM_CRON_INTERVAL} minutes`
  )
  for (const [pairKey, count] of recentOrderCounts.entries()) {
    // Get the pair from the unimind parameters table
    const pairData = await unimindParametersRepo.getByPair(pairKey)
    // We haven't seen this pair before, so it must have received the default parameters
    if (!pairData) {
      log.info(`Unimind updateParameters: No parameters found for pair ${pairKey}, updating with default parameters`)

      // Log analytics event
      analyticsService?.logUnimindParameterUpdate({
        pair: pairKey,
        updateType: UnimindUpdateType.NEW_PAIR,
        newIntrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        orderCount: count,
        batchNumber: 0,
        algorithmVersion: UNIMIND_ALGORITHM_VERSION,
      })

      await unimindParametersRepo.put({
        pair: pairKey,
        intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        count,
        version: UNIMIND_ALGORITHM_VERSION,
        batchNumber: 0,
        lastUpdatedAt: Math.floor(Date.now() / 1000),
      })
    } else if (!validateParameters(pairData, log)) {
      log.info(`Unimind updateParameters: Parameters for pair ${pairKey} are invalid, updating with default parameters`)

      // Log analytics event
      analyticsService?.logUnimindParameterUpdate({
        pair: pairKey,
        updateType: UnimindUpdateType.ALGORITHM_UPDATE,
        previousIntrinsicValues: pairData.intrinsicValues,
        newIntrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        orderCount: count,
        batchNumber: 0,
        algorithmVersion: UNIMIND_ALGORITHM_VERSION,
      })

      await unimindParametersRepo.put({
        pair: pairKey,
        intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        count,
        version: UNIMIND_ALGORITHM_VERSION,
        batchNumber: 0,
        lastUpdatedAt: Math.floor(Date.now() / 1000),
      })
    } else {
      // We have seen this pair before, check if we need to update the parameters
      const totalCount = pairData.count + count
      if (totalCount >= UNIMIND_UPDATE_THRESHOLD) {
        log.info(
          `Unimind updateParameters: Total count for pair ${pairKey} is greater than or equal to ${UNIMIND_UPDATE_THRESHOLD}, updating parameters`
        )
        // Update the parameters
        // Query for the last totalCount instances of this pair in the orders table
        const pairOrders = (await ordersRepo.getOrdersFilteredByType(
          totalCount,
          {
            sortKey: SORT_FIELDS.CREATED_AT,
            sort: 'gt(0)', // required field to get it to sort descending
            desc: true,
            pair: pairKey,
          },
          [OrderType.Dutch_V3],
          undefined // no cursor needed
        )) as QueryResult<DutchV3OrderEntity>
        log.info(`Unimind updateParameters: Found ${pairOrders.orders.length} orders for pair ${pairKey}`)
        const statistics = getStatistics(pairOrders.orders, log)
        const batchMetrics = calculateBatchMetrics(statistics)
        const strategy = new PriceImpactStrategy()
        const updatedParameters = strategy.unimindAlgorithm(statistics, pairData, log)
        log.info(
          `Unimind updateParameters: Updated parameters for pair ${pairKey} are ${JSON.stringify(updatedParameters)}`
        )
        const nextBatchNumber = (pairData.batchNumber !== undefined ? pairData.batchNumber : 0) + 1

        // Log analytics event with statistics for threshold-based updates
        analyticsService?.logUnimindParameterUpdate({
          pair: pairKey,
          updateType: UnimindUpdateType.THRESHOLD_REACHED,
          previousIntrinsicValues: pairData.intrinsicValues,
          newIntrinsicValues: JSON.stringify(updatedParameters),
          orderCount: count,
          totalCount: totalCount,
          batchNumber: nextBatchNumber,
          algorithmVersion: UNIMIND_ALGORITHM_VERSION,
          updateThreshold: UNIMIND_UPDATE_THRESHOLD,
          statistics: JSON.stringify(statistics), // JSON stringify for consistent data pipeline handling
          meanWaitTime: batchMetrics.meanWaitTime,
          medianWaitTime: batchMetrics.medianWaitTime,
          fillRate: batchMetrics.fillRate,
        })

        await unimindParametersRepo.put({
          pair: pairKey,
          intrinsicValues: JSON.stringify(updatedParameters),
          count: 0,
          version: UNIMIND_ALGORITHM_VERSION,
          batchNumber: nextBatchNumber,
          lastUpdatedAt: Math.floor(Date.now() / 1000),
        })
        const intrinsicValues = JSON.parse(pairData.intrinsicValues)
        log.info(
          `Unimind updateParameters: parameters for ${pairKey} updated from ` +
            `${Object.entries(intrinsicValues)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')} ` +
            `to ${Object.entries(updatedParameters)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')} ` +
            `based on ${totalCount} recent orders. ` +
            `Version: ${UNIMIND_ALGORITHM_VERSION}, Batch: ${nextBatchNumber}`
        )
        metrics?.putMetric(`unimind-parameters-updated-${pairKey}`, 1, Unit.Count)
        metrics?.putMetric(`unimind-batch-number-${pairKey}`, nextBatchNumber, Unit.None)
      } else {
        log.info(
          `Unimind updateParameters: Total count for pair ${pairKey} (${totalCount}) is less than ${UNIMIND_UPDATE_THRESHOLD}, not updating parameters`
        )
        // Update the count
        await unimindParametersRepo.put({
          pair: pairKey,
          intrinsicValues: pairData.intrinsicValues,
          count: totalCount,
          version: UNIMIND_ALGORITHM_VERSION,
          batchNumber: pairData.batchNumber || 0,
          lastUpdatedAt: pairData.lastUpdatedAt,
        })
      }
    }
  }

  const afterUpdateTime = Date.now()
  const updateTime = afterUpdateTime - beforeUpdateTime
  metrics?.putMetric(`unimind-parameters-update-time`, updateTime)
}

export async function getUnimindOrdersByTimeRange(
  ordersRepo: DutchOrdersRepository,
  timeRange: number,
  log: Logger
): Promise<UniswapXOrderEntity[]> {
  // Calculate the timestamp from timeRange minutes ago in seconds
  const timeRangeSeconds = timeRange * 60 // convert minutes to seconds
  const currentTimeSeconds = Math.floor(Date.now() / 1000) // current time in seconds
  const cutoffTime = currentTimeSeconds - timeRangeSeconds

  // Query Dutch V3 orders created after the cutoff time
  const result = await ordersRepo.getOrdersFilteredByType(
    2000, // reasonable limit for processing
    {
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: `gt(${cutoffTime})`,
      desc: true,
      chainId: ChainId.ARBITRUM_ONE,
    },
    [OrderType.Dutch_V3],
    undefined // no cursor needed for this query
  )

  // Filter out the orders that did not use Unimind and exclude cancelled orders
  const unimindOrders = result.orders.filter(
    (order) =>
      order.usedUnimind && (order.orderStatus === ORDER_STATUS.FILLED || order.orderStatus === ORDER_STATUS.EXPIRED)
  )
  log.info(
    `Unimind getOrdersByTimeRange: Found ${result.orders.length} orders. ${unimindOrders.length} of them used Unimind and are filled or expired.`
  )

  return unimindOrders
}

// Aggregates orders by trading pair and returns a map of pair to count
function getOrderCountsByPair(orders: UniswapXOrderEntity[]): Map<string, number> {
  const pairCounts = new Map<string, number>()

  for (const order of orders) {
    const pair = order.pair
    if (pair) {
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1)
    }
  }

  return pairCounts
}

export interface UnimindStatistics {
  waitTimes: (number | undefined)[]
  fillStatuses: number[]
  priceImpacts: number[]
}

export interface UnimindBatchMetrics {
  meanWaitTime: number | undefined
  medianWaitTime: number | undefined
  fillRate: number
}

export function calculateBatchMetrics(statistics: UnimindStatistics): UnimindBatchMetrics {
  const { waitTimes, fillStatuses } = statistics

  // Calculate fill rate using all orders
  const fillRate = fillStatuses.reduce((sum, status) => sum + status, 0) / fillStatuses.length

  // Filter out undefined wait times (unfilled orders) for wait time calculations
  const validWaitTimes = waitTimes.filter((wt): wt is number => wt !== undefined)

  // Calculate mean and median wait times from filled orders only
  const meanWaitTime =
    validWaitTimes.length > 0 ? validWaitTimes.reduce((sum, wt) => sum + wt, 0) / validWaitTimes.length : undefined

  const medianWaitTime = validWaitTimes.length > 0 ? median(validWaitTimes) : undefined

  return {
    meanWaitTime,
    medianWaitTime,
    fillRate,
  }
}

export function getStatistics(orders: DutchV3OrderEntity[], log: Logger): UnimindStatistics {
  const waitTimes: (number | undefined)[] = []
  const fillStatuses: number[] = []
  const priceImpacts: number[] = []

  for (const order of orders) {
    if (
      order.fillBlock &&
      order.cosignerData?.decayStartBlock &&
      order.priceImpact != null &&
      order.orderStatus === ORDER_STATUS.FILLED
    ) {
      waitTimes.push(order.fillBlock - order.cosignerData.decayStartBlock)
      fillStatuses.push(1)
      priceImpacts.push(order.priceImpact)
      log.info(
        `Unimind getStatistics: order ${order.orderHash} filled with wait time ${
          order.fillBlock - order.cosignerData.decayStartBlock
        }.` + ` Its price impact was ${order.priceImpact}`
      )
    } else if (order.priceImpact != null && order.orderStatus === ORDER_STATUS.EXPIRED) {
      waitTimes.push(undefined)
      fillStatuses.push(0)
      priceImpacts.push(order.priceImpact)
      log.info(`Unimind getStatistics: order ${order.orderHash} expired, resulting in an undefined wait time`)
    } else {
      log.warn(`Unimind getStatistics: order ${order.orderHash} cannot be used for statistics, skipping`)
      continue
    }
  }

  return {
    waitTimes,
    fillStatuses,
    priceImpacts,
  }
}

export function validateParameters(parameters: UnimindParameters, log: Logger): boolean {
  try {
    const intrinsicValues = JSON.parse(parameters.intrinsicValues)
    const version = parameters.version
    // Check that the intrinsic parameters are using the keys we're currently using in the algorithm
    for (const key in intrinsicValues) {
      if (!Object.keys(JSON.parse(DEFAULT_UNIMIND_PARAMETERS)).includes(key)) {
        return false
      }
    }
    if (version !== UNIMIND_ALGORITHM_VERSION) {
      return false
    }
  } catch (error) {
    log.error(`Unimind validateParameters: Error parsing intrinsic values: ${error}`)
    return false
  }
  return true
}
