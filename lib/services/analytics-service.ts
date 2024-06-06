import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { FillInfo, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../entities'
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
    const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
    this.logger.info('Analytics Message', {
      eventType: 'OrderPosted',
      body: {
        quoteId: order.quoteId,
        createdAt: this.createdAtTimestampInSeconds(),
        orderHash: order.orderHash,
        startTime: order.decayStartTime,
        endTime: order.decayEndTime,
        deadline: order.deadline,
        chainId: order.chainId,
        inputStartAmount: order.input?.startAmount,
        inputEndAmount: order.input?.endAmount,
        tokenIn: order.input?.token,
        outputStartAmount: userOutput.startAmount,
        outputEndAmount: userOutput.endAmount,
        tokenOut: userOutput.token,
        filler: this.getFillerAddress(order.filler ?? AddressZero),
        orderType: orderType,
      },
    })
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
    order: UniswapXOrderEntity,
    orderType: OrderType,
    quoteId: string | undefined,
    timestamp: number,
    gasCostInETH: string,
    gasPriceWei: string,
    gasUsed: string,
    userAmount: SettledAmount
  ): void {
    log.info('Fill Info', {
      orderInfo: {
        orderStatus: ORDER_STATUS.FILLED,
        orderHash: fill.orderHash,
        orderType: orderType,
        quoteId: quoteId,
        exclusiveFiller: this.getFillerAddress(order.cosignerData?.exclusiveFiller ?? AddressZero),
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
}
