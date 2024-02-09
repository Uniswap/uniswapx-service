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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this._stop) {
        return
      }
      let openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX)
      let totalCheckedOrders = 0
      do {
        for (let i = 0; i < openOrders.orders.length; i++) {
          // metrics.addMetric(MetricName.OrderFetcherLoopStarted(), 1)
          try {
            // const loopStartTime = new Date().getTime()
            const order = openOrders.orders[i]
            await this.updateOrder(order)
          } catch (e: any) {
            log.error(`Unexpected error in status job`, { error: e })
            metrics.addMetric('Status loop error', MetricUnits.Count, 1)
          } finally {
            // metrics.publishStoredMetrics()
            // metrics.clearMetrics()
          }
        }
        totalCheckedOrders += openOrders.orders.length
      } while (
        openOrders.cursor &&
        (openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_READ_MAX, openOrders.cursor))
      )

      log.info(`finished processing orders`, { totalCheckedOrders })
      await delay(LOOP_DELAY_MS)
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

// log.warn('found open orders', { length: openOrders.orders.length })
// if (openOrders.cursor) {
//   openOrders = await this.dbInterface.getByOrderStatus(ORDER_STATUS.OPEN, BATCH_WRITE_MAX, openOrders.cursor)
// } else {
//   log.warn('breaking')
//   break
// }
