import { DutchOrder, EventWatcher, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { log } from '../../Logging'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { SfnStateInputOutput } from '../base'
import { FillEventProcessor } from './fill-event-processor'
import { AVERAGE_BLOCK_TIME, FILL_EVENT_LOOKBACK_BLOCKS_ON, IS_TERMINAL_STATE } from './util'

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
  quoteId?: string //only used for logging
}

export class CheckOrderStatusService {
  private readonly fillEventProcessor
  constructor(
    private dbInterface: BaseOrdersRepository,
    private fillEventBlockLookback: (chainId: ChainId) => number = FILL_EVENT_LOOKBACK_BLOCKS_ON
  ) {
    this.fillEventProcessor = new FillEventProcessor(fillEventBlockLookback)
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
    log.info('parsed order', { order: parsedOrder, signature: order.signature })
    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    const curBlockNumber = await provider.getBlockNumber()
    const fromBlock = startingBlockNumber ?? curBlockNumber - this.fillEventBlockLookback(chainId)

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
          const settledAmounts = await this.fillEventProcessor.processFillEvent({
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
          const settledAmounts = await this.fillEventProcessor.processFillEvent({
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
    retryCount: number
    startingBlockNumber: number
    chainId: number
    lastStatus: ORDER_STATUS
    orderStatus: ORDER_STATUS
    validation: OrderValidation
    quoteId?: string
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
