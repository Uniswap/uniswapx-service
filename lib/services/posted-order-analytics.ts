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

/** The record is a log line. The local stack's sink: it has no delivery stream. */
export class LogLinePostedOrderAnalytics implements PostedOrderAnalytics {
  constructor(private readonly records: AnalyticsService) {}

  async send(_ctx: PostContext, order: UniswapXOrderEntity, orderType: OrderType): Promise<void> {
    this.records.logOrderPosted(order, orderType)
  }
}

/**
 * Puts the record straight on the posted-orders delivery stream: `JSON.stringify(record)` plus a
 * newline, the bytes the old log path's processor wrote for the same record (it never ended a
 * record with a newline, so its files glued some records `}{`; the loader parses both).
 *
 * Best-effort, as in the monorepo's ETLLogger: a record whose put fails is dropped and counted,
 * never re-sent, so a put that did reach Firehose can't produce a second copy.
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
      // The dashboard's Orders Posted table reads this line.
      ctx.logger.info('Sent posted order analytics record', { body: record })
    } catch (err) {
      ctx.metrics.putMetric('PostedOrderAnalyticsDropped', 1, Unit.Count)
      ctx.logger.warn('Posted order analytics put failed; dropping the record', {
        orderHash: order.orderHash,
        err,
      })
    }
  }
}
