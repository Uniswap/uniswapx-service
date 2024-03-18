import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../entities'
import { log } from '../Logging'
import { DutchV1Order } from '../models/DutchV1Order'
import { LimitOrder } from '../models/LimitOrder'
import { currentTimestampInSeconds } from '../util/time'

export interface AnalyticsServiceInterface {
  logOrderPosted(order: DutchV1Order | LimitOrder): void
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

  public logOrderPosted(orderModel: DutchV1Order | LimitOrder) {
    const order = orderModel.toEntity()
    const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
    // Log used for cw dashboard and redshift metrics, do not modify
    // skip fee output logging
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
        orderType: order.type,
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
