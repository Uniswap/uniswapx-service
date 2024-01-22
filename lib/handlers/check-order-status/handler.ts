import { DutchOrder, FillInfo, OrderValidation } from '@uniswap/uniswapx-sdk'

import { Unit } from 'aws-embedded-metrics'
import { default as Logger } from 'bunyan'
import { BigNumber, ethers } from 'ethers'
import Joi from 'joi'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { ChainId } from '../../util/chain'
import { NATIVE_ADDRESS } from '../../util/constants'
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
      orderStatus,
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
          const settledAmounts = this.getSettledAmounts(fillEvent, timestamp, parsedOrder)

          this.logFillInfo(
            log,
            fillEvent,
            quoteId,
            timestamp,
            gasCostInETH,
            receipt.effectiveGasPrice.toString(),
            receipt.gasUsed.toString(),
            settledAmounts.reduce((prev, cur) =>
              prev && BigNumber.from(prev.amountOut).gt(cur.amountOut) ? prev : cur
            )
          )

          const percentDecayed = (timestamp - order.decayStartTime) / (order.decayEndTime - order.decayStartTime)
          metrics.putMetric(`OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, percentDecayed, Unit.Percent)

          // blocks until fill is the number of blocks between the fill event and the starting block number (need to add back the look back blocks)
          const blocksUntilFill = fillEvent.blockNumber - (startingBlockNumber + FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId))
          metrics.putMetric(`OrderSfn-BlocksUntilFill-chain-${chainId}`, blocksUntilFill, Unit.Count)

          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              lastStatus: orderStatus,
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
              lastStatus: orderStatus,
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
            lastStatus: orderStatus,
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
            lastStatus: orderStatus,
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
          const settledAmounts = this.getSettledAmounts(fillEvent, timestamp, parsedOrder)

          this.logFillInfo(
            log,
            fillEvent,
            quoteId,
            timestamp,
            gasCostInETH,
            receipt.effectiveGasPrice.toString(),
            receipt.gasUsed.toString(),
            settledAmounts.reduce((prev, cur) =>
              prev && BigNumber.from(prev.amountOut).gt(cur.amountOut) ? prev : cur
            )
          )

          const percentDecayed =
            order.decayEndTime === order.decayStartTime
              ? 0
              : (timestamp - order.decayStartTime) / (order.decayEndTime - order.decayStartTime)
          metrics.putMetric(`OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, percentDecayed, Unit.Percent)

          // blocks until fill is the number of blocks between the fill event and the starting block number (need to add back the look back blocks)
          const blocksUntilFill = fillEvent.blockNumber - (startingBlockNumber + FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId))
          metrics.putMetric(`OrderSfn-BlocksUntilFill-chain-${chainId}`, blocksUntilFill, Unit.Count)

          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              quoteId,
              retryCount,
              startingBlockNumber: fromBlock,
              chainId,
              lastStatus: orderStatus,
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
              lastStatus: orderStatus,
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
            lastStatus: orderStatus,
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
      lastStatus: ORDER_STATUS
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
      log.info(
        {
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

  private logFillInfo(
    log: Logger,
    fill: FillInfo,
    quoteId: string,
    timestamp: number,
    gasCostInETH: string,
    gasPriceWei: string,
    gasUsed: string,
    userAmount: SettledAmount
  ): void {
    log.info({
      orderInfo: {
        orderStatus: ORDER_STATUS.FILLED,
        orderHash: fill.orderHash,
        quoteId: quoteId,
        filler: fill.filler,
        nonce: fill.nonce.toString(),
        offerer: fill.swapper,
        tokenIn: userAmount.tokenIn,
        amountIn: userAmount.amountIn,
        tokenOut: userAmount.tokenOut,
        amountOut: userAmount.amountOut,
        blockNumber: fill.blockNumber,
        txHash: fill.txHash,
        fillTimestamp: timestamp,
        gasPriceWei: gasPriceWei,
        gasUsed: gasUsed,
        gasCostInETH: gasCostInETH,
        logTime: Math.floor(Date.now() / 1000).toString(),
      },
    })
  }

  public getSettledAmounts(fill: FillInfo, fillTimestamp: number, parsedOrder: DutchOrder): SettledAmount[] {
    const nativeOutputs = parsedOrder.info.outputs.filter((output) => output.token.toLowerCase() === NATIVE_ADDRESS)
    const settledAmounts: SettledAmount[] = []
    let amountIn: string
    if (parsedOrder.info.input.endAmount.eq(parsedOrder.info.input.startAmount)) {
      // If the order is EXACT_INPUT then the input will not decay and resolves to the startAmount/endAmount.
      amountIn = parsedOrder.info.input.startAmount.toString()

      // Resolve the native outputs using the fill timestamp and filler address from the fill log.
      // This will give us a minimum resolved amount for native out swaps.
      const resolvedOrder = parsedOrder.resolve({ timestamp: fillTimestamp, filler: fill.filler })
      const resolvedNativeOutputs = resolvedOrder.outputs.filter(
        (output) => output.token.toLowerCase() === NATIVE_ADDRESS
      )

      // Add all the resolved native outputs to the settledAmounts as they are not included in the fill logs.
      resolvedNativeOutputs.forEach((resolvedNativeOutput) => {
        settledAmounts.push({
          tokenIn: parsedOrder.info.input.token,
          amountIn,
          tokenOut: resolvedNativeOutput.token,
          amountOut: resolvedNativeOutput.amount.toString(),
        })
      })
    } else {
      // If the order is EXACT_OUTPUT we will have all the ERC20 transfers in the fill logs,
      // only log the amountIn that matches the order input token.

      // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
      const input = fill.inputs.find(
        (input) => input.token.toLowerCase() === parsedOrder.info.input.token.toLowerCase()
      )!
      amountIn = input.amount.toString()

      // Add all the native outputs to the settledAmounts as they are not included in the fill logs.
      // The amount is just the startAmount because the order is EXACT_OUTPUT so there is no decay on the outputs.
      nativeOutputs.forEach((nativeOutput) => {
        settledAmounts.push({
          tokenIn: parsedOrder.info.input.token,
          amountIn,
          tokenOut: nativeOutput.token,
          amountOut: nativeOutput.startAmount.toString(),
        })
      })
    }

    fill.outputs.forEach((output) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: output.token,
        amountOut: output.amount.toString(),
      })
    })

    return settledAmounts
  }
}
