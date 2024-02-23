import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../entities'
import { CheckOrderStatusRequest, CheckOrderStatusService } from '../handlers/check-order-status/service'
import { LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../handlers/check-order-status/util'
import { log } from '../Logging'
import { OnChainStatusCheckerMetricNames, powertoolsMetric as metrics } from '../Metrics'
import { BaseOrdersRepository, QueryResult } from '../repositories/base'

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

  public getWatcher(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
    if (!REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch]) {
      throw new Error(`No Reactor Address Defined in UniswapX SDK for chainId:${chainId}, orderType${OrderType.Dutch}`)
    }
    return new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch] as string)
  }

  public getProvider(chainId: number) {
    const rpcURL = process.env[`RPC_${chainId}`]
    if (!rpcURL) {
      throw new Error(`rpcURL not defined for ${chainId}`)
    }
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId)
    return provider
  }

  public getValidator(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
    return new OrderValidator(provider, chainId)
  }

  public async pollForOpenOrders() {
    // eslint-disable-next-line no-constant-condition
    while (!this._stop) {
      let totalCheckedOrders = 0
      let processedOrderError = 0
      const startTime = new Date().getTime()
      try {
        let openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX)
        do {
          const promises = await this.processOrderBatch(openOrders)
          const results = await Promise.allSettled(promises)
          processedOrderError += results.filter((p) => p.status === 'rejected').length
          totalCheckedOrders += openOrders.orders.length
        } while (
          openOrders.cursor &&
          (openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX, openOrders.cursor))
        )
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
          MetricUnits.Seconds,
          (new Date().getTime() - startTime) / 1000
        )
        metrics.addMetric(OnChainStatusCheckerMetricNames.LoopCompleted, MetricUnits.Count, 1)
        metrics.publishStoredMetrics()
        metrics.clearMetrics()
        await delay(LOOP_DELAY_MS)
      }
    }
    //should never reach this
    metrics.addMetric(OnChainStatusCheckerMetricNames.LoopEnded, MetricUnits.Count, 1)
  }

  public async processOrderBatch(openOrders: QueryResult) {
    const promises = []
    for (let i = 0; i < openOrders.orders.length; i++) {
      const order = openOrders.orders[i]
      promises.push(
        (async function (statusChecker: OnChainStatusChecker): Promise<void> {
          try {
            await statusChecker.updateOrder(order)
          } catch (e) {
            log.error('OnChainStatusChecker Error Processing Order', { error: e })
            throw e
          }
        })(this)
      )
    }
    return promises
  }

  // TODO: https://linear.app/uniswap/issue/DAT-264/batch-update-order-status
  public async updateOrder(order: OrderEntity): Promise<void> {
    const chainId = order.chainId
    const provider = this.getProvider(chainId)
    const quoter = this.getValidator(provider, chainId)
    // TODO: use different reactor address for different order type
    const watcher = this.getWatcher(provider, chainId)

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
    await delay(RECHECK_DELAY)
    await this.checkOrderStatusService.handleRequest({ ...request, getFillLogAttempts: 1 })
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
