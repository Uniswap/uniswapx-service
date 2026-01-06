import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { FillInfo, OrderType } from '@uniswap/uniswapx-sdk'
import {
  isDutchV3OrderEntity,
  isPriorityOrderEntity,
  ORDER_STATUS,
  RelayOrderEntity,
  SettledAmount,
  UniswapXOrderEntity,
} from '../entities'
import { log } from '../Logging'
import { ANALYTICS_EVENTS } from '../util/analytics-events'
import { UnimindUpdateType } from '../util/constants'
import { currentTimestampInSeconds } from '../util/time'

export interface AnalyticsServiceInterface {
  logOrderPosted(order: UniswapXOrderEntity, orderType: OrderType): void
  logCancelled(orderHash: string, orderType: OrderType, quoteId?: string): void
  logInsufficientFunds(orderHash: string, orderType: OrderType, quoteId?: string): void
  logUnimindResponse(params: UnimindResponseParams): void
  logUnimindParameterUpdate(params: UnimindParameterUpdateParams): void
}

// Parameters for Unimind response analytics
export interface UnimindResponseParams {
  pi: number
  tau: number
  batchNumber: number
  algorithmVersion: number
  quoteId: string
  pair: string
  swapper?: string
  priceImpact: number
  referencePrice: string
  route?: any
  amountIn?: string
  amountOut?: string
  chainId?: number
  tradeType?: string
  onUnimindTokenList?: boolean
}

// Parameters for Unimind parameter update analytics
export interface UnimindParameterUpdateParams {
  pair: string
  updateType: UnimindUpdateType
  previousIntrinsicValues?: string
  newIntrinsicValues: string
  orderCount: number
  totalCount?: number
  batchNumber: number
  algorithmVersion: number
  updateThreshold?: number
  // Statistics from batch - only provided for THRESHOLD_REACHED updates (JSON stringified)
  statistics?: string
  // Batch metrics - only provided for THRESHOLD_REACHED updates
  meanWaitTime?: number
  medianWaitTime?: number
  fillRate?: number
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
      usedUnimind: order?.usedUnimind ?? false,
      priceImpact: order?.priceImpact,
      referencePrice: order?.referencePrice,
    }

    if (isPriorityOrderEntity(order)) {
      const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.amount > cur.amount ? prev : cur))
      this.logger.info('Analytics Message', {
        eventType: ANALYTICS_EVENTS.ORDER_POSTED,
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
        eventType: ANALYTICS_EVENTS.ORDER_POSTED,
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
        eventType: ANALYTICS_EVENTS.ORDER_POSTED,
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
    fillTimeBlocks: number,
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
        fillTimeBlocks: fillTimeBlocks,
        logTime: Math.floor(Date.now() / 1000).toString(),
      },
    })
  }

  public logUnimindResponse(params: UnimindResponseParams): void {
    this.logger.info('Analytics Message', {
      eventType: ANALYTICS_EVENTS.UNIMIND_RESPONSE,
      body: {
        createdAt: this.createdAtTimestampInSeconds(),
        createdAtMs: Date.now().toString(),
        ...params,
        // Ensure route is stringified if it exists
        route: params.route ? JSON.stringify(params.route) : undefined,
        // Format the swapper address consistently with other analytics
        swapper: this.getFillerAddress(params.swapper ?? AddressZero),
        tradeType: params.tradeType,
      },
    })
  }

  public logUnimindParameterUpdate(params: UnimindParameterUpdateParams): void {
    this.logger.info('Analytics Message', {
      eventType: ANALYTICS_EVENTS.UNIMIND_PARAMETER_UPDATE,
      body: {
        createdAt: this.createdAtTimestampInSeconds(),
        createdAtMs: Date.now().toString(),
        ...params,
      },
    })
  }
}
