import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { EventWatcher, OrderType, OrderValidator, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../entities'
import { CheckOrderStatusRequest, CheckOrderStatusService } from '../handlers/check-order-status/service'
import { log } from '../Logging'
import { powertoolsMetric } from '../Metrics'
import { BaseOrdersRepository } from '../repositories/base'

const TWO_MINUTES_MS = 60 * 2 * 1000
const LOOP_DELAY_MS = 30000 //30 seconds

export const BATCH_READ_MAX = 100

export class OnChainStatusChecker {
  private checkOrderStatusService: CheckOrderStatusService
  constructor(private dbInterface: BaseOrdersRepository, private _stop = false) {
    this.checkOrderStatusService = new CheckOrderStatusService(dbInterface)
  }
  public stop() {
    this._stop = true
  }

  public getWatcher(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
    return new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch])
  }

  public getProvider(chainId: number) {
    const rpcURL = process.env[`RPC_${chainId}`]
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId)
    return provider
  }

  public getValidator(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
    return new OrderValidator(provider, chainId)
  }

  public async checkStatus() {
    const metrics = powertoolsMetric
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let totalCheckedOrders = 0
      let statusLoopError = 0
      let startTime = new Date().getTime()
      try {
        if (this._stop) {
          return
        }
        let openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX)

        do {
          for (let i = 0; i < openOrders.orders.length; i++) {
            // metrics.addMetric(MetricName.OrderFetcherLoopStarted(), 1)
            try {
              // const loopStartTime = new Date().getTime()
              const order = openOrders.orders[i]
              await this.updateOrder(order)
            } catch (e: any) {
              log.error(`Unexpected error in status job`, { error: e })
              statusLoopError++
            }
          }
          totalCheckedOrders += openOrders.orders.length
        } while (
          openOrders.cursor &&
          (openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX, openOrders.cursor))
        )
        log.info(`finished processing orders`, { totalCheckedOrders })
      } catch (e) {
        log.error('OnChainStatusChecker Error', { error: e })
        metrics.addMetric('OnChainStatusCheckerError', MetricUnits.Count, 1)
      } finally {
        metrics.addMetric('OnChainStatusChecker-TotalProcessedOpenOrders', MetricUnits.Count, totalCheckedOrders)
        metrics.addMetric('OnChainStatusChecker-TotalOrderProcessingErrors', MetricUnits.Count, statusLoopError)
        metrics.addMetric(
          'OnChainStatusChecker-TotalLoopProcessingTime',
          MetricUnits.Milliseconds,
          new Date().getTime() - startTime
        )
        metrics.publishStoredMetrics()
        metrics.clearMetrics()
        await delay(LOOP_DELAY_MS)
      }
    }
  }

  public async updateOrder(order: OrderEntity) {
    const chainId = order.chainId
    const provider = this.getProvider(chainId)
    const quoter = this.getValidator(provider, chainId)
    // TODO: use different reactor address for different order type
    const watcher = this.getWatcher(provider, chainId)

    const request: CheckOrderStatusRequest = {
      chainId: chainId,
      quoteId: order.quoteId,
      orderHash: order.orderHash,
      startingBlockNumber: 0, //check this
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
      setTimeout(async () => {
        await this.checkOrderStatusService.handleRequest(request)
      }, TWO_MINUTES_MS * 1000)
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}