import { DutchOrder, OrderValidation } from '@uniswap/gouda-sdk'
import { default as Logger } from 'bunyan'
import { ethers } from 'ethers'
import Joi from 'joi'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'

export const IS_TERMINAL_STATE = (state: ORDER_STATUS): boolean => {
  return [ORDER_STATUS.CANCELLED, ORDER_STATUS.FILLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.ERROR].includes(state)
}

export const FILL_EVENT_LOOKBACK_BLOCKS_ON = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 10
    case ChainId.POLYGON:
      return 100
    default:
      return 10
  }
}

export const AVERAGE_BLOCK_TIME = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 12
    case ChainId.POLYGON:
      // Keep this at the default 12 for now since we would have to do more retries
      // if it was at 2 seconds
      return 12
    default:
      return 12
  }
}

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<SfnStateInputOutput> {
    const { dbInterface } = input.containerInjected
    const {
      log,
      chainId,
      quoteId,
      orderHash,
      getFillLogAttempts,
      startingBlockNumber,
      retryCount,
      provider,
      orderWatcher,
      orderQuoter,
    } = input.requestInjected

    const order = checkDefined(
      await dbInterface.getByHash(orderHash),
      'cannot find order by hash when updating order status'
    )

    const parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
    log.info({ order: parsedOrder, signature: order.signature }, 'parsed order')
    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    const curBlockNumber = await provider.getBlockNumber()
    const fromBlock = !startingBlockNumber
      ? curBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId)
      : startingBlockNumber

    log.info({ validation: validation, curBlock: curBlockNumber, orderHash: order.orderHash }, 'validated order')
    switch (validation) {
      case OrderValidation.Expired: {
        // order could still be filled even when OrderQuoter.quote bubbled up 'expired' revert
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
          const tx = await provider.getTransaction(fillEvent.txHash)
          const receipt = await tx.wait()
          const gasCostInETH = ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed))
          const timestamp = (await provider.getBlock(fillEvent.blockNumber)).timestamp
          fillEvent.outputs.forEach((output) => {
            log.info({
              orderInfo: {
                orderStatus: ORDER_STATUS.FILLED,
                orderHash: fillEvent.orderHash,
                quoteId: quoteId,
                filler: fillEvent.filler,
                nonce: fillEvent.nonce.toString(),
                offerer: fillEvent.offerer,
                tokenOut: output.token,
                amountOut: output.amount.toString(),
                blockNumber: fillEvent.blockNumber,
                txHash: fillEvent.txHash,
                fillTimestamp: timestamp,
                gasPriceWei: receipt.effectiveGasPrice.toString(),
                gasUsed: receipt.gasUsed.toString(),
                gasCostInETH: gasCostInETH,
              },
            })
          })

          const settledAmounts = fillEvent.outputs.map((output) => ({
            tokenOut: output.token,
            amountOut: output.amount.toString(),
          }))

          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              orderStatus: ORDER_STATUS.FILLED,
              txHash: fillEvent.txHash,
              settledAmounts,
              validation,
            },
            log
          )
        } else {
          if (getFillLogAttempts == 0) {
            log.info(
              {
                orderInfo: {
                  orderHash: orderHash,
                },
              },
              'failed to get fill log in expired case, retrying one more time'
            )
          }
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              // if there are no fill logs, retry one more time in case of node syncing issues
              orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.EXPIRED,
              getFillLogAttempts: getFillLogAttempts + 1,
              validation,
            },
            log
          )
        }
      }
      case OrderValidation.InsufficientFunds:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            quoteId,
            retryCount,
            startingBlockNumber: fromBlock,
            chainId,
            orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
            validation,
          },
          log
        )
      case OrderValidation.InvalidSignature:
      case OrderValidation.InvalidOrderFields:
      case OrderValidation.UnknownError:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            quoteId,
            retryCount,
            startingBlockNumber: fromBlock,
            chainId,
            orderStatus: ORDER_STATUS.ERROR,
            validation,
          },
          log
        )
      case OrderValidation.NonceUsed: {
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
          const tx = await provider.getTransaction(fillEvent.txHash)
          const receipt = await tx.wait()
          const gasCostInETH = ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed))
          const timestamp = (await provider.getBlock(fillEvent.blockNumber)).timestamp
          fillEvent.outputs.forEach((output) => {
            log.info({
              orderInfo: {
                orderStatus: ORDER_STATUS.FILLED,
                orderHash: fillEvent.orderHash,
                quoteId: quoteId,
                filler: fillEvent.filler,
                nonce: fillEvent.nonce.toString(),
                offerer: fillEvent.offerer,
                tokenOut: output.token,
                amountOut: output.amount.toString(),
                blockNumber: fillEvent.blockNumber,
                txHash: fillEvent.txHash,
                fillTimestamp: timestamp,
                gasPriceWei: receipt.effectiveGasPrice.toString(),
                gasUsed: receipt.gasUsed.toString(),
                gasCostInETH: gasCostInETH,
                tokenInChainId: chainId,
                tokenOutChainId: chainId,
              },
            })
          })

          const settledAmounts = fillEvent.outputs.map((output) => ({
            tokenOut: output.token,
            amountOut: output.amount.toString(),
          }))

          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              orderStatus: ORDER_STATUS.FILLED,
              txHash: fillEvent.txHash,
              settledAmounts,
              validation,
            },
            log
          )
        } else {
          log.info(
            {
              orderInfo: {
                orderHash: orderHash,
              },
            },
            'failed to get fill log in nonce used case, retrying one more time'
          )
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              // if there are no fill logs, retry one more time in case of node syncing issues
              orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.CANCELLED,
              getFillLogAttempts: getFillLogAttempts + 1,
              validation,
            },
            log
          )
        }
      }
      default:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            quoteId,
            retryCount,
            startingBlockNumber: fromBlock,
            chainId,
            orderStatus: ORDER_STATUS.OPEN,
            validation,
          },
          log
        )
    }
  }

  private async updateStatusAndReturn(
    params: {
      dbInterface: BaseOrdersRepository
      orderHash: string
      quoteId: string
      retryCount: number
      startingBlockNumber: number
      chainId: number
      orderStatus: ORDER_STATUS
      validation: OrderValidation
      txHash?: string
      settledAmounts?: SettledAmount[]
      getFillLogAttempts?: number
    },
    log: Logger
  ): Promise<SfnStateInputOutput> {
    const {
      dbInterface,
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber,
      chainId,
      orderStatus,
      txHash,
      settledAmounts,
      getFillLogAttempts,
      validation
    } = params

    log.info(
      {
        orderHash,
        quoteId,
        retryCount,
        startingBlockNumber,
        chainId,
        orderStatus,
        txHash,
        settledAmounts,
        getFillLogAttempts,
      },
      'updating order status'
    )
    await dbInterface.updateOrderStatus(orderHash, orderStatus, txHash, settledAmounts)

    if (IS_TERMINAL_STATE(orderStatus)) {
      metrics.putMetric(`OrderSfn-${orderStatus}`, 1)
      metrics.putMetric(`OrderSfn-${orderStatus}-chain-${chainId}`, 1)
      log.info({
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
          validation
        },
      })
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

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
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
}
