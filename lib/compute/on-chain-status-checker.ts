import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { OrderEntity, ORDER_STATUS } from '../entities'
import { SfnStateInputOutput } from '../handlers/base'
import { CheckOrderStatusRequest, CheckOrderStatusService } from '../handlers/check-order-status/service'
import {
  getProvider,
  getValidator,
  getWatcher,
  LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON,
} from '../handlers/check-order-status/util'
import { log } from '../Logging'
import { OnChainStatusCheckerMetricNames, powertoolsMetric as metrics } from '../Metrics'
import { BaseOrdersRepository, QueryResult } from '../repositories/base'
import { SUPPORTED_CHAINS } from '../util/chain'

const RECHECK_DELAY = 30 * 1000 //30 seconds
const LOOP_DELAY_MS = 30 * 1000 //30 seconds

// arbitrary and capricious value
// if increasing check memory utilization
export const BATCH_READ_MAX = 100
export class OnChainStatusChecker {
  private checkOrderStatusService: CheckOrderStatusService
  constructor(private dbInterface: BaseOrdersRepository, private _stop = false) {
    this.checkOrderStatusService = new CheckOrderStatusService(dbInterface, LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON)
  }
  public stop() {
    this._stop = true
  }
  public async getFromDynamo(cursor?: any) {
    try {
      let startTime = new Date().getTime()
      let orders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX, cursor)
      let endTime = new Date().getTime()
      metrics.addMetric('OnChainStatusChecker-DynamoBatchReadTime', MetricUnits.Milliseconds, endTime - startTime)
      return orders
    } catch (e) {
      log.error('error in getFromDynamo', { error: e })
      throw e
    }
  }

  public async pollForOpenOrders() {
    try {
      while (!this._stop) {
        let totalCheckedOrders = 0
        let processedOrderError = 0
        const startTime = new Date().getTime()
        let asyncLoopCalls = []
        try {
          log.info('starting processing orders')
          let openOrders = await this.getFromDynamo()
          do {
            asyncLoopCalls.push(this.loopProcess(openOrders))
          } while (openOrders.cursor && (openOrders = await this.getFromDynamo(openOrders.cursor)))

          await Promise.allSettled(asyncLoopCalls)

          for (let i = 0; i < asyncLoopCalls.length; i++) {
            let { processedCount, errorCount } = await asyncLoopCalls[i]
            processedOrderError += errorCount
            totalCheckedOrders += processedCount
          }

          log.info(`finished processing orders`, { totalCheckedOrders })
        } catch (e) {
          log.error('OnChainStatusChecker Error', { error: e })
          metrics.addMetric(OnChainStatusCheckerMetricNames.LoopError, MetricUnits.Count, 1)
        } finally {
          metrics.addMetric(
            OnChainStatusCheckerMetricNames.TotalProcessedOpenOrders,
            MetricUnits.Count,
            totalCheckedOrders
          )
          metrics.addMetric(
            OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors,
            MetricUnits.Count,
            processedOrderError
          )
          metrics.addMetric(
            OnChainStatusCheckerMetricNames.TotalLoopProcessingTime,
            MetricUnits.Milliseconds,
            new Date().getTime() - startTime
          )
          metrics.addMetric(OnChainStatusCheckerMetricNames.LoopCompleted, MetricUnits.Count, 1)
          metrics.publishStoredMetrics()
          metrics.clearMetrics()
          await delay(LOOP_DELAY_MS)
        }
      }
    } catch (e) {
      log.error('what is happening', { error: e })
    } finally {
      //should never reach this
      metrics.addMetric(OnChainStatusCheckerMetricNames.LoopEnded, MetricUnits.Count, 1)
    }
  }

  public async loopProcess(openOrders: QueryResult) {
    let errorCount = 0
    let processedCount = openOrders.orders.length
    try {
      const { promises, batchSize } = await this.processOrderBatch(openOrders)
      //await all promises
      let responses = await Promise.allSettled(promises)
      for (let i = 0; i < promises.length; i++) {
        let response = responses[i]
        if (response.status === 'rejected') {
          errorCount += batchSize[i]
        }
        if (response.status === 'fulfilled') {
          let output = response.value
          for (let j = 0; j < output.length; j++) {
            let singleOutput = output[j]
            if (typeof singleOutput.getFillLogAttempts === 'number' && singleOutput.getFillLogAttempts > 0) {
              let chainId: number = typeof singleOutput.chainId === 'number' ? singleOutput.chainId : 1
              let orderHash = singleOutput.orderHash
              let orderStatus: ORDER_STATUS = singleOutput.orderStatus as ORDER_STATUS
              if (!orderHash || !(typeof orderHash === 'string')) {
                continue
              }
              log.info('setting off retry', { orderHash })
              let provider = getProvider(chainId)
              this.retryUpdate({
                chainId: chainId,
                orderHash: orderHash,
                startingBlockNumber: 0,
                orderStatus: orderStatus,
                getFillLogAttempts: 1,
                retryCount: 1,
                provider: provider,
                orderWatcher: getWatcher(provider, chainId),
                orderQuoter: getValidator(provider, chainId),
                quoteId: '',
              })
            }
          }
        }
      }
      return { processedCount, errorCount }
    } catch (e) {
      log.error('error in loopProcess', { error: e })
      return { processedCount, errorCount: processedCount }
    }
  }

  public async processOrderBatch(openOrders: QueryResult) {
    const openOrdersPerChain = this.mapOpenOrdersToChain(openOrders.orders)
    const promises: Promise<SfnStateInputOutput[]>[] = []
    const batchSize: number[] = []

    Object.keys(openOrdersPerChain).forEach((chain) => {
      const chainId = parseInt(chain)
      let orders = openOrdersPerChain[chainId]
      if (orders.length === 0) {
        return
      }
      //get all promises
      promises.push(this.getOrderChangesBatch(orders, chainId))
      batchSize.push(orders.length)
    })
    //return promises per chain & batchsize per chain
    return { promises, batchSize }
  }

  public mapOpenOrdersToChain(batch: OrderEntity[]) {
    let chainToOrdersMap: Record<number, OrderEntity[]> = {}

    SUPPORTED_CHAINS.forEach((chainId) => {
      chainToOrdersMap[chainId] = []
    })

    for (let i = 0; i < batch.length; i++) {
      const { chainId } = batch[i]
      chainToOrdersMap[chainId].push(batch[i])
    }

    return chainToOrdersMap
  }

  public async getOrderChangesBatch(orders: OrderEntity[], chainId: number): Promise<SfnStateInputOutput[]> {
    return await this.checkOrderStatusService.batchHandleRequestPerChain(orders, chainId)
  }

  // TODO: https://linear.app/uniswap/issue/DAT-264/batch-update-order-status
  public async updateOrder(order: OrderEntity): Promise<void> {
    const chainId = order.chainId
    const provider = getProvider(chainId)
    const quoter = getValidator(provider, chainId)
    // TODO: use different reactor address for different order type
    const watcher = getWatcher(provider, chainId)

    const request: CheckOrderStatusRequest = {
      chainId: chainId,
      quoteId: order.quoteId || '',
      orderHash: order.orderHash,
      startingBlockNumber: 0, // if 0, looks back 50 blocks, otherwise looks from given block
      orderStatus: order.orderStatus,
      getFillLogAttempts: 0, //expire if >0 and order status is expired
      retryCount: 0, //only relevant to step function retry backoff
      provider: provider,
      orderWatcher: watcher,
      orderQuoter: quoter,
    }

    const response = await this.checkOrderStatusService.handleRequest(request)
    if (typeof response.getFillLogAttempts === 'number' && response.getFillLogAttempts > 0) {
      //check for fill event one more time and expire
      this.retryUpdate(request)
    }
  }

  //retry after 30 seconds
  public async retryUpdate(request: CheckOrderStatusRequest) {
    try {
      await delay(RECHECK_DELAY)
      await this.checkOrderStatusService.handleRequest({ ...request, getFillLogAttempts: 1 })
    } catch (e) {
      log.error('retryUpdate error', { error: e })
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
