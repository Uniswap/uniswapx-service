import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DutchOrderEntity, ORDER_STATUS } from '../entities'
import { log } from '../Logging'
import { currentTimestampInSeconds } from '../util/time'

export interface AnalyticsServiceInterface {
  logOrderPosted(order: DutchOrderEntity, orderType: OrderType): void
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

  public logOrderPosted(order: DutchOrderEntity, orderType: OrderType) {
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
}
