import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { DutchOrder, EventWatcher, FillInfo, OrderValidation, OrderValidator, SignedOrder } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { OrderEntity, ORDER_STATUS, SettledAmount } from '../../entities'
import { log } from '../../Logging'
import { powertoolsMetric as betterMetrics } from '../../Metrics'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { SfnStateInputOutput } from '../base'
import { FillEventLogger } from './fill-event-logger'
import {
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  getProvider,
  getSettledAmounts,
  getValidator,
  getWatcher,
  IS_TERMINAL_STATE,
} from './util'

export type CheckOrderStatusRequest = {
  chainId: number
  orderHash: string
  startingBlockNumber: number
  orderStatus: ORDER_STATUS
  getFillLogAttempts: number
  retryCount: number
  provider: ethers.providers.StaticJsonRpcProvider
  orderWatcher: EventWatcher
  orderQuoter: OrderValidator
  quoteId: string //only used for logging
}

type ExtraUpdateInfo = {
  orderStatus: ORDER_STATUS
  txHash?: string
  settledAmounts?: SettledAmount[]
  getFillLogAttempts?: number
}

export class CheckOrderStatusService {
  private readonly fillEventLogger
  constructor(
    private dbInterface: BaseOrdersRepository,
    private fillEventBlockLookback: (chainId: ChainId) => number = FILL_EVENT_LOOKBACK_BLOCKS_ON
  ) {
    this.fillEventLogger = new FillEventLogger(fillEventBlockLookback)
  }

  public async handleRequest({
    chainId,
    quoteId,
    orderHash,
    getFillLogAttempts,
    startingBlockNumber,
    retryCount,
    provider,
    orderWatcher,
    orderQuoter,
    orderStatus,
  }: CheckOrderStatusRequest): Promise<SfnStateInputOutput> {
    const order = checkDefined(
      await this.dbInterface.getByHash(orderHash),
      'cannot find order by hash when updating order status'
    )
    const parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    const curBlockNumber = await provider.getBlockNumber()
    const fromBlock = !startingBlockNumber ? curBlockNumber - this.fillEventBlockLookback(chainId) : startingBlockNumber

    const commonUpdateInfo = {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber: fromBlock,
      chainId,
      lastStatus: orderStatus,
      validation,
    }

    const fillEvents = await orderWatcher.getFillInfo(fromBlock, curBlockNumber)

    const extraUpdateInfo = await this.getStatusFromValidation({
      validation,
      parsedOrder,
      quoteId,
      chainId,
      startingBlockNumber,
      order,
      orderHash,
      provider,
      getFillLogAttempts,
      fillEvents,
    })

    const updateObject = {
      ...commonUpdateInfo,
      ...extraUpdateInfo,
    }

    return this.updateStatusAndReturn(updateObject)
  }

  public async batchHandleRequestPerChain(batch: OrderEntity[], chainId: ChainId): Promise<SfnStateInputOutput[]> {
    const provider = getProvider(chainId)
    const validator = getValidator(provider, chainId)
    const orderWatcher = getWatcher(provider, chainId)

    const validationsRequestList: SignedOrder[] = []
    for (let i = 0; i < batch.length; i++) {
      const order = batch[i]
      const parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
      validationsRequestList.push({ order: parsedOrder, signature: order.signature })
    }

    let startTime = new Date().getTime()
    const validationResults = await validator.validateBatch(validationsRequestList)
    let endTime = new Date().getTime()
    betterMetrics.addMetric(
      'OnChainStatusChecker-ValidateBatchQueryTime',
      MetricUnits.Milliseconds,
      endTime - startTime
    )

    const updateList = []
    startTime = new Date().getTime()
    // TODO:(urgent) add block number and fill info to the top level loop and pass in
    const curBlockNumber = await provider.getBlockNumber()
    const fromBlock = curBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId)
    const fillEvents = await orderWatcher.getFillInfo(fromBlock, curBlockNumber)
    endTime = new Date().getTime()
    betterMetrics.addMetric(
      'OnChainStatusChecker-RandomOnChainQueryTimes',
      MetricUnits.Milliseconds,
      endTime - startTime
    )

    for (let i = 0; i < batch.length; i++) {
      const { chainId, orderHash, orderStatus } = batch[i]
      const quoteId = batch[i].quoteId || ''
      const order = batch[i]
      const validation = validationResults[i]
      const parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
      const retryCount = 0

      const commonUpdateInfo = {
        orderHash,
        quoteId,
        retryCount,
        startingBlockNumber: fromBlock,
        chainId,
        lastStatus: orderStatus,
        validation,
      }

      //TODO:(urgent) all at once
      const extraUpdateInfo = await this.getStatusFromValidation({
        validation,
        parsedOrder,
        quoteId,
        chainId,
        startingBlockNumber: fromBlock,
        order,
        orderHash,
        provider,
        getFillLogAttempts: 0,
        fillEvents,
      })

      const updateObject = {
        ...commonUpdateInfo,
        ...extraUpdateInfo,
      }
      updateList.push(updateObject)
    }

    const updatePromises: Promise<SfnStateInputOutput>[] = []
    updateList.forEach(async (u) => {
      if (u.orderStatus !== u.lastStatus) {
        updatePromises.push(this.updateStatusAndReturn(u))
      }
    })

    await Promise.all(updatePromises)
    return updateList
  }

  private async getStatusFromValidation({
    validation,
    parsedOrder,
    quoteId,
    chainId,
    startingBlockNumber,
    order,
    orderHash,
    provider,
    getFillLogAttempts,
    fillEvents,
  }: {
    validation: OrderValidation
    parsedOrder: DutchOrder
    quoteId: string
    chainId: number
    startingBlockNumber: number
    order: OrderEntity
    orderHash: string
    provider: ethers.providers.JsonRpcProvider
    getFillLogAttempts: number
    fillEvents: FillInfo[]
  }): Promise<ExtraUpdateInfo> {
    let extraUpdateInfo: ExtraUpdateInfo
    const fillEvent = fillEvents.find((e) => e.orderHash === orderHash)

    switch (validation) {
      case OrderValidation.Expired: {
        if (fillEvent) {
          const [tx, block] = await Promise.all([
            provider.getTransaction(fillEvent.txHash),
            provider.getBlock(fillEvent.blockNumber),
          ])
          const settledAmounts = getSettledAmounts(fillEvent, block.timestamp, parsedOrder)

          await this.fillEventLogger.processFillEvent({
            fillEvent,
            quoteId,
            chainId,
            startingBlockNumber,
            order,
            settledAmounts,
            tx,
            timestamp: block.timestamp,
          })

          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: fillEvent.txHash,
            settledAmounts,
          }
          break
        } else {
          extraUpdateInfo = {
            orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.EXPIRED,
            getFillLogAttempts: getFillLogAttempts + 1,
          }
          break
        }
      }
      case OrderValidation.InsufficientFunds:
        extraUpdateInfo = {
          orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        }
        break
      case OrderValidation.InvalidSignature:
      case OrderValidation.InvalidOrderFields:
      case OrderValidation.UnknownError:
        extraUpdateInfo = { orderStatus: ORDER_STATUS.ERROR }
        break
      case OrderValidation.NonceUsed: {
        if (fillEvent) {
          const [tx, block] = await Promise.all([
            provider.getTransaction(fillEvent.txHash),
            provider.getBlock(fillEvent.blockNumber),
          ])
          const settledAmounts = getSettledAmounts(fillEvent, block.timestamp, parsedOrder)

          await this.fillEventLogger.processFillEvent({
            fillEvent,
            quoteId,
            chainId,
            startingBlockNumber,
            order,
            settledAmounts,
            tx,
            timestamp: block.timestamp,
          })

          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: fillEvent.txHash,
            settledAmounts,
          }
          break
        } else {
          extraUpdateInfo = {
            orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.CANCELLED,
            getFillLogAttempts: getFillLogAttempts + 1,
          }
          break
        }
      }
      default:
        extraUpdateInfo = {
          orderStatus: ORDER_STATUS.OPEN,
        }
        break
    }
    return extraUpdateInfo
  }

  private async updateStatusAndReturn(params: {
    orderHash: string
    retryCount: number
    startingBlockNumber: number
    chainId: number
    lastStatus: ORDER_STATUS
    orderStatus: ORDER_STATUS
    validation: OrderValidation
    quoteId: string
    txHash?: string
    settledAmounts?: SettledAmount[]
    getFillLogAttempts?: number
  }): Promise<SfnStateInputOutput> {
    const {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber,
      chainId,
      lastStatus,
      orderStatus,
      txHash,
      settledAmounts,
      getFillLogAttempts,
      validation,
    } = params

    // Avoid updating the order if the status is unchanged.
    // This also avoids unnecessarily triggering downstream events from dynamodb changes.
    if (orderStatus !== lastStatus) {
      log.info('calling updateOrderStatus', { orderHash, orderStatus, lastStatus })
      await this.dbInterface.updateOrderStatus(orderHash, orderStatus, txHash, settledAmounts)
      if (IS_TERMINAL_STATE(orderStatus)) {
        metrics.putMetric(`OrderSfn-${orderStatus}`, 1)
        metrics.putMetric(`OrderSfn-${orderStatus}-chain-${chainId}`, 1)
        log.info('order in terminal state', {
          terminalOrderInfo: {
            orderStatus,
            orderHash,
            quoteId: quoteId,
            getFillLogAttempts,
            startingBlockNumber,
            chainId: chainId,
            settledAmounts: settledAmounts
              ?.map((s) => JSON.stringify(s))
              .join(',')
              .toString(),
            retryCount,
            validation,
          },
        })
      }
    }

    return {
      orderHash: orderHash,
      orderStatus: orderStatus,
      retryCount: (retryCount || 0) + 1,
      quoteId: quoteId,
      retryWaitSeconds: this.calculateRetryWaitSeconds(chainId, retryCount),
      startingBlockNumber: startingBlockNumber,
      chainId: chainId,
      ...(settledAmounts && { settledAmounts }),
      ...(txHash && { txHash }),
      ...(getFillLogAttempts && { getFillLogAttempts }),
    }
  }

  /*
   * In the first hour of order submission, we check the order status roughly every block.
   * We then do exponential backoff on the wait time until the interval reaches roughly 6 hours.
   * All subsequent retries are at 6 hour intervals.
   */
  public calculateRetryWaitSeconds(chainId: ChainId, retryCount: number): number {
    return retryCount <= 300
      ? AVERAGE_BLOCK_TIME(chainId)
      : retryCount <= 450
      ? Math.ceil(AVERAGE_BLOCK_TIME(chainId) * Math.pow(1.05, retryCount - 300))
      : 18000
  }
}
