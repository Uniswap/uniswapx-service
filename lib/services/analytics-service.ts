import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { OrderEntity } from '../entities'
import { log } from '../Logging'
import { currentTimestampInSeconds } from '../util/time'

// used to log data used for analytics
export class AnalyticsService {
  constructor(
    private logger: Logger,
    private createdAtTimestampInSeconds: () => string,
    private getFillerAddress: (address: string) => string
  ) {}

  //create a new AnalyticsService with default service logger
  public static create() {
    return new AnalyticsService(log, currentTimestampInSeconds, getAddress)
  }

  public logOrderPosted(order: OrderEntity, orderType: OrderType) {
    const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
    this.logger.info('Analytics Message', {
      eventType: 'OrderPostedV2',
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
}
