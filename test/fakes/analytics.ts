import { OrderType } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../../lib/entities'
import { AnalyticsServiceInterface } from '../../lib/services/analytics-service'
import { PostedOrderAnalytics } from '../../lib/services/posted-order-analytics'

export type OrderPostedEvent = { order: UniswapXOrderEntity; orderType: OrderType }
export type OrderEndedEvent = { orderHash: string; orderType: OrderType; quoteId?: string }

export class RecordingAnalytics implements AnalyticsServiceInterface, PostedOrderAnalytics {
  public readonly posted: OrderPostedEvent[] = []
  public readonly cancelled: OrderEndedEvent[] = []
  public readonly insufficientFunds: OrderEndedEvent[] = []

  async send(_ctx: unknown, order: UniswapXOrderEntity, orderType: OrderType): Promise<void> {
    this.posted.push({ order, orderType })
  }

  logCancelled(orderHash: string, orderType: OrderType, quoteId?: string): void {
    this.cancelled.push({ orderHash, orderType, quoteId })
  }

  logInsufficientFunds(orderHash: string, orderType: OrderType, quoteId?: string): void {
    this.insufficientFunds.push({ orderHash, orderType, quoteId })
  }
}
