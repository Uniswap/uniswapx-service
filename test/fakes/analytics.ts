import { OrderType } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../../lib/entities'
import { AnalyticsServiceInterface } from '../../lib/services/analytics-service'

export type OrderPostedEvent = { order: UniswapXOrderEntity; orderType: OrderType }
export type OrderEndedEvent = { orderHash: string; orderType: OrderType; quoteId?: string }

export class RecordingAnalytics implements AnalyticsServiceInterface {
  public readonly posted: OrderPostedEvent[] = []
  public readonly cancelled: OrderEndedEvent[] = []
  public readonly insufficientFunds: OrderEndedEvent[] = []

  logOrderPosted(order: UniswapXOrderEntity, orderType: OrderType): void {
    this.posted.push({ order, orderType })
  }

  logCancelled(orderHash: string, orderType: OrderType, quoteId?: string): void {
    this.cancelled.push({ orderHash, orderType, quoteId })
  }

  logInsufficientFunds(orderHash: string, orderType: OrderType, quoteId?: string): void {
    this.insufficientFunds.push({ orderHash, orderType, quoteId })
  }
}
