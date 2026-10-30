import { OrderType } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { UniswapXOrderEntity } from '../entities'
import { FirehoseRecordWriter } from '../handlers/shared/firehose'
import type { PostContext } from './OrderPoster'
import { AnalyticsService } from './analytics-service'

/**
 * Where a post sends its order's analytics record. `send` never rejects. On Lambda the post must
 * await it before returning, or the put is frozen with the environment and never sent.
 */
export interface PostedOrderAnalytics {
  send(ctx: PostContext, order: UniswapXOrderEntity, orderType: OrderType): Promise<void>
}

/** The record is its log line, which the subscription filter delivers. The local stack's sink. */
export class LogLinePostedOrderAnalytics implements PostedOrderAnalytics {
  constructor(private readonly records: AnalyticsService) {}

  async send(_ctx: PostContext, order: UniswapXOrderEntity, orderType: OrderType): Promise<void> {
    this.records.logOrderPosted(order, orderType)
  }
}

/**
 * Puts the record straight on the posted-orders delivery stream: `JSON.stringify(record)` plus a
 * newline, the bytes the log path's processor writes for the same record (it never ended a record
 * with a newline, so its files glued some records `}{`; the loader parses both).
 *
 * A put that fails is written as the old log line instead, which the subscription filter still
 * carries to the same bucket. A put that timed out may also have landed; the loader dedupes on
 * quoteId and orderHash within the hour, so that costs at most a duplicate it drops.
 */
export class FirehosePostedOrderAnalytics implements PostedOrderAnalytics {
  constructor(
    private readonly records: AnalyticsService,
    private readonly streamName: string,
    private readonly writer: FirehoseRecordWriter
  ) {}

  async send(ctx: PostContext, order: UniswapXOrderEntity, orderType: OrderType): Promise<void> {
    let record: object
    try {
      record = this.records.postedOrderRecord(order, orderType)
    } catch (err) {
      ctx.logger.error('Failed to build the posted order analytics record', { orderHash: order.orderHash, err })
      return
    }
    try {
      await this.writer.putRecord(this.streamName, Buffer.from(JSON.stringify(record) + '\n'))
      ctx.metrics.putMetric('PostedOrderAnalyticsSent', 1, Unit.Count)
      // No eventType, so the subscription filter skips it; the dashboard's Orders Posted table reads it.
      ctx.logger.info('Sent posted order analytics record', { body: record })
    } catch (err) {
      ctx.metrics.putMetric('PostedOrderAnalyticsFallback', 1, Unit.Count)
      ctx.logger.warn('Posted order analytics put failed; writing the log line instead', {
        orderHash: order.orderHash,
        err,
      })
      this.records.logPostedOrderRecord(record)
    }
  }
}
