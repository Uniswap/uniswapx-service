import { default as Logger } from 'bunyan'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { FillInfo, OrderType } from '@uniswap/uniswapx-sdk'
import { isDutchV3OrderEntity, isPriorityOrderEntity, ORDER_STATUS, RelayOrderEntity, SettledAmount, UniswapXOrderEntity } from '../entities'
import { log } from '../Logging'
import { currentTimestampInSeconds } from '../util/time'

export interface AnalyticsServiceInterface {
  logOrderPosted(order: UniswapXOrderEntity, orderType: OrderType): void
  logCancelled(orderHash: string, orderType: OrderType, quoteId?: string): void
  logInsufficientFunds(orderHash: string, orderType: OrderType, quoteId?: string): void
}
// used to log data used for analytics
export class AnalyticsService implements AnalyticsServiceInterface {
  constructor(
    private logger: Logger,
    private createdAtTimestampInSeconds: () => string,
    private getFillerAddress: (address: string) => string
  ) {}

  //create a new AnalyticsService with default service logger
  public static create() {
    return new AnalyticsService(log, currentTimestampInSeconds, getAddress)
  }

  public logOrderPosted(order: UniswapXOrderEntity, orderType: OrderType) {
    const sharedFields = {
      quoteId: order.quoteId,
      createdAt: this.createdAtTimestampInSeconds(),
      orderHash: order.orderHash,
      deadline: order.deadline,
      chainId: order.chainId,
      filler: this.getFillerAddress(order.filler ?? AddressZero),
      tokenIn: order.input?.token,
      tokenOut: order.outputs[0].token,
      orderType: orderType,
      blockNumber: order?.blockNumber,
      route: JSON.stringify(order?.route),
    }

    if (isPriorityOrderEntity(order)) {
      const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.amount > cur.amount ? prev : cur))
      this.logger.info('Analytics Message', {
        eventType: 'OrderPosted',
        body: Object.assign(sharedFields, {
          auctionStartBlock: order.auctionStartBlock,
          auctionTargetBlock: order.cosignerData.auctionTargetBlock,
          baselinePriorityFeeWei: order.baselinePriorityFeeWei,
          inputStartAmount: order.input?.amount,
          inputEndAmount: order.input?.amount,
          inputMpsPerPriorityFeeWei: order.input?.mpsPerPriorityFeeWei,
          outputStartAmount: userOutput.amount,
          outputEndAmount: userOutput.amount,
          outputMpsPerPriorityFeeWei: userOutput.mpsPerPriorityFeeWei,
        }),
      })
    } else if (isDutchV3OrderEntity(order)) {
      const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
      this.logger.info('Analytics Message', {
        eventType: 'OrderPosted',
        body: Object.assign(sharedFields, {
          startBlock: order.cosignerData.decayStartBlock,
          inputStartAmount: order.input?.startAmount,
          inputCurve: JSON.stringify(order.input?.curve),
          outputStartAmount: userOutput.startAmount,
          outputCurve: JSON.stringify(userOutput.curve),
          startingBaseFee: order.startingBaseFee,
        }),
      })
    } else {
      const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
      this.logger.info('Analytics Message', {
        eventType: 'OrderPosted',
        body: Object.assign(sharedFields, {
          startTime: order.decayStartTime,
          endTime: order.decayEndTime,
          inputStartAmount: order.input?.startAmount,
          inputEndAmount: order.input?.endAmount,
          outputStartAmount: userOutput.startAmount,
          outputEndAmount: userOutput.endAmount,
        }),
      })
    }
  }

  public logCancelled(orderHash: string, orderType: OrderType, quoteId?: string) {
    this.logger.info('Analytics Message', {
      orderInfo: {
        orderHash,
        quoteId,
        orderType,
        orderStatus: ORDER_STATUS.CANCELLED,
      },
    })
  }

  public logInsufficientFunds(orderHash: string, orderType: OrderType, quoteId?: string) {
    this.logger.info('Analytics Message', {
      orderInfo: {
        orderHash,
        quoteId,
        orderType,
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      },
    })
  }

  public logFillInfo(
    fill: FillInfo,
    order: UniswapXOrderEntity | RelayOrderEntity,
    quoteId: string | undefined,
    timestamp: number,
    gasCostInETH: string,
    gasPriceWei: string,
    gasUsed: string,
    effectivePriorityFee: string,
    userAmount: SettledAmount
  ): void {
    log.info('Fill Info', {
      orderInfo: {
        orderStatus: ORDER_STATUS.FILLED,
        orderHash: fill.orderHash,
        orderType: order.type,
        quoteId: quoteId,
        exclusiveFiller:
          'cosignerData' in order && 'exclusiveFiller' in order.cosignerData
            ? this.getFillerAddress(order.cosignerData.exclusiveFiller)
            : AddressZero,
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
        effectivePriorityFee: effectivePriorityFee,
        logTime: Math.floor(Date.now() / 1000).toString(),
      },
    })
  }
}
