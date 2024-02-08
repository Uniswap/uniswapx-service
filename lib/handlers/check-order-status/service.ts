import { DutchOrder, EventWatcher, FillInfo, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'

import { Unit } from 'aws-embedded-metrics'
import { BigNumber, ethers } from 'ethers'
import { OrderEntity, ORDER_STATUS, SettledAmount } from '../../entities'
import { log } from '../../Logging'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { SfnStateInputOutput } from '../base'
import {
  AVERAGE_BLOCK_TIME,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  getSettledAmounts,
  IS_TERMINAL_STATE,
  logFillInfo,
} from './util'

type ProcessFillEventRequest = {
  fillEvent: FillInfo
  provider: ethers.providers.StaticJsonRpcProvider
  parsedOrder: DutchOrder
  quoteId: string
  order: OrderEntity
  chainId: number
  startingBlockNumber: number
}

export type CheckOrderStatusRequest = {
  chainId: number
  quoteId: string
  orderHash: string
  startingBlockNumber: number
  orderStatus: ORDER_STATUS
  getFillLogAttempts: number
  retryCount: number
  provider: ethers.providers.StaticJsonRpcProvider
  orderWatcher: EventWatcher
  orderQuoter: OrderValidator
}

export class CheckOrderStatusService {
  constructor(public dbInterface: BaseOrdersRepository) {}

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
    log.info('parsed order', { order: parsedOrder, signature: order.signature })
    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    const curBlockNumber = await provider.getBlockNumber()
    const fromBlock = !startingBlockNumber
      ? curBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId)
      : startingBlockNumber

    const commonUpdateInfo = {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber: fromBlock,
      chainId,
      lastStatus: orderStatus,
      validation,
    }

    let extraUpdateInfo: {
      orderStatus: ORDER_STATUS
      txHash?: string
      settledAmounts?: SettledAmount[]
      getFillLogAttempts?: number
    }

    log.info('validated order', { validation: validation, curBlock: curBlockNumber, orderHash: order.orderHash })
    switch (validation) {
      case OrderValidation.Expired: {
        // order could still be filled even when OrderQuoter.quote bubbled up 'expired' revert
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
          let settledAmounts = await this.processFillEvent({
            provider,
            fillEvent,
            parsedOrder,
            quoteId,
            chainId,
            startingBlockNumber,
            order,
          })

          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: fillEvent.txHash,
            settledAmounts,
          }
          break
        } else {
          if (getFillLogAttempts == 0) {
            log.info('failed to get fill log in expired case, retrying one more time', {
              orderInfo: {
                orderHash: orderHash,
              },
            })
          }
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
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
          let settledAmounts = await this.processFillEvent({
            provider,
            fillEvent,
            parsedOrder,
            quoteId,
            chainId,
            startingBlockNumber,
            order,
          })

          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: fillEvent.txHash,
            settledAmounts,
          }
          break
        } else {
          log.info('failed to get fill log in nonce used case, retrying one more time', {
            orderInfo: {
              orderHash: orderHash,
            },
          })
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
    return this.updateStatusAndReturn({
      ...commonUpdateInfo,
      ...extraUpdateInfo,
    })
  }

  private async updateStatusAndReturn(params: {
    orderHash: string
    quoteId: string
    retryCount: number
    startingBlockNumber: number
    chainId: number
    lastStatus: ORDER_STATUS
    orderStatus: ORDER_STATUS
    validation: OrderValidation
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
      log.info('updating order status', {
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
      })
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
      quoteId: quoteId,
      retryCount: retryCount + 1,
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
  private calculateRetryWaitSeconds(chainId: ChainId, retryCount: number): number {
    return retryCount <= 300
      ? AVERAGE_BLOCK_TIME(chainId)
      : retryCount <= 450
      ? Math.ceil(AVERAGE_BLOCK_TIME(chainId) * Math.pow(1.05, retryCount - 300))
      : 18000
  }

  private async processFillEvent({
    provider,
    fillEvent,
    parsedOrder,
    quoteId,
    order,
    chainId,
    startingBlockNumber,
  }: ProcessFillEventRequest): Promise<SettledAmount[]> {
    const tx = await provider.getTransaction(fillEvent.txHash)
    const receipt = await tx.wait()
    const gasCostInETH = ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed))
    const timestamp = (await provider.getBlock(fillEvent.blockNumber)).timestamp
    const settledAmounts = getSettledAmounts(fillEvent, timestamp, parsedOrder)

    logFillInfo(
      fillEvent,
      quoteId,
      timestamp,
      gasCostInETH,
      receipt.effectiveGasPrice.toString(),
      receipt.gasUsed.toString(),
      settledAmounts.reduce((prev, cur) => (prev && BigNumber.from(prev.amountOut).gt(cur.amountOut) ? prev : cur))
    )

    const percentDecayed =
      order.decayEndTime === order.decayStartTime
        ? 0
        : (timestamp - order.decayStartTime) / (order.decayEndTime - order.decayStartTime)
    metrics.putMetric(`OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, percentDecayed, Unit.Percent)

    // blocks until fill is the number of blocks between the fill event and the starting block number (need to add back the look back blocks)
    const blocksUntilFill = fillEvent.blockNumber - (startingBlockNumber + FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId))
    metrics.putMetric(`OrderSfn-BlocksUntilFill-chain-${chainId}`, blocksUntilFill, Unit.Count)
    return settledAmounts
  }
}
