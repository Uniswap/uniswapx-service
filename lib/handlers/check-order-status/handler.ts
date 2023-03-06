import { DutchLimitOrder, OrderValidation } from '@uniswap/gouda-sdk'
import { default as Logger } from 'bunyan'
import Joi from 'joi'
import { ORDER_STATUS, SettledAmount } from '../../entities/Order'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { SfnLambdaHandler, SfnStateInputOutput } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<SfnStateInputOutput> {
    const { dbInterface } = input.containerInjected
    const { log, chainId, quoteId, orderHash, lastBlockNumber, retryCount, provider, orderWatcher, orderQuoter } =
      input.requestInjected

    const order = checkDefined(
      await dbInterface.getByHash(orderHash),
      'cannot find order by hash when updating order status'
    )

    const parsedOrder = DutchLimitOrder.parse(order.encodedOrder, chainId)
    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    const curBlockNumber = await provider.getBlockNumber()

    log.info({ validation: validation, curBlock: curBlockNumber, orderHash: order.orderHash }, 'validating order')
    switch (validation) {
      case OrderValidation.Expired: {
        // order could still be filled even when OrderQuoter.quote bubbled up 'expired' revert
        const fromBlock = lastBlockNumber === 0 ? curBlockNumber - 5 : lastBlockNumber
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
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
              lastBlockNumber: curBlockNumber,
              chainId,
              orderStatus: ORDER_STATUS.FILLED,
              txHash: fillEvent.txHash,
              settledAmounts,
            },
            log
          )
        } else {
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              lastBlockNumber: curBlockNumber,
              chainId,
              orderStatus: ORDER_STATUS.EXPIRED,
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
            lastBlockNumber: curBlockNumber,
            chainId,
            orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
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
            lastBlockNumber: curBlockNumber,
            chainId,
            orderStatus: ORDER_STATUS.ERROR,
          },
          log
        )
      case OrderValidation.NonceUsed: {
        const fromBlock = lastBlockNumber === 0 ? curBlockNumber - 5 : lastBlockNumber
        const fillEvent = (await orderWatcher.getFillInfo(fromBlock, curBlockNumber)).find(
          (e) => e.orderHash === orderHash
        )
        if (fillEvent) {
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
              lastBlockNumber: curBlockNumber,
              chainId,
              orderStatus: ORDER_STATUS.FILLED,
              txHash: fillEvent.txHash,
              settledAmounts,
            },
            log
          )
        } else {
          log.info({
            orderInfo: {
              orderStatus: ORDER_STATUS.CANCELLED,
              orderHash: orderHash,
            },
          })
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              lastBlockNumber: curBlockNumber,
              chainId,
              orderStatus: ORDER_STATUS.CANCELLED,
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
            lastBlockNumber: curBlockNumber,
            chainId,
            orderStatus: ORDER_STATUS.OPEN,
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
      lastBlockNumber: number
      chainId: number
      orderStatus: ORDER_STATUS
      txHash?: string
      settledAmounts?: SettledAmount[]
    },
    log: Logger
  ): Promise<SfnStateInputOutput> {
    const {
      dbInterface,
      orderHash,
      quoteId,
      retryCount,
      lastBlockNumber,
      chainId,
      orderStatus,
      txHash,
      settledAmounts,
    } = params

    log.info(
      { orderHash, quoteId, retryCount, lastBlockNumber, chainId, orderStatus, txHash, settledAmounts },
      'updating order status'
    )
    await dbInterface.updateOrderStatus(orderHash, orderStatus, txHash, settledAmounts)
    return {
      orderHash: orderHash,
      orderStatus: orderStatus,
      quoteId: quoteId,
      retryCount: retryCount + 1,
      retryWaitSeconds: this.calculateRetryWaitSeconds(retryCount),
      lastBlockNumber: lastBlockNumber,
      chainId: chainId,
      ...(settledAmounts && { settledAmounts }),
      ...(txHash && { txHash }),
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
  private calculateRetryWaitSeconds(retryCount: number): number {
    return retryCount <= 300 ? 12 : retryCount <= 450 ? Math.ceil(12 * Math.pow(1.05, retryCount - 300)) : 18000
  }
}
