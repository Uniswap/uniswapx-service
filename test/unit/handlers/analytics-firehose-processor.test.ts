import { gzipSync } from 'node:zlib'
import {
  MAX_RESPONSE_BYTES,
  processFirehoseEvent,
  transformRecord,
  unwrapAnalyticsRecord,
} from '../../../lib/handlers/analytics-firehose-processor/processor'
import { log } from '../../../lib/Logging'

// Shape CloudWatch Logs hands to a Firehose subscription destination.
function cloudWatchRecord(recordId: string, payload: unknown) {
  return { recordId, data: gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8')).toString('base64') }
}

function dataMessage(...messages: string[]) {
  return {
    messageType: 'DATA_MESSAGE',
    owner: '316116520258',
    logGroup: '/aws/lambda/PostOrder',
    logStream: '2026/09/08/[$LATEST]abc',
    subscriptionFilters: ['PostedOrdersFeed'],
    logEvents: messages.map((message, i) => ({ id: `${i}`, timestamp: 1_788_886_866_000 + i, message })),
  }
}

// Real powertools log lines as emitted by AnalyticsService, envelope fields included.
const POSTED_ORDER_LINE = JSON.stringify({
  level: 'INFO',
  message: 'Analytics Message',
  service: 'GoudaService',
  timestamp: '2026-09-08T17:01:06.000Z',
  eventType: 'OrderPosted',
  body: {
    quoteId: '2ffb8f21-7eca-495f-bcd6-2362377b3bd6',
    createdAt: '1788886866',
    orderHash: '0xe7b7c5afe7660b2967263c750e236a428d76c8b16c46c804def05f87309e1ab8',
    deadline: 1788887159,
    chainId: 4663,
    filler: '0x09e99D23BF226a6c6b4C2126239a3DF3CA1B89b6',
    tokenIn: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
    tokenOut: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD',
    orderType: 'Dutch_V3',
    startBlock: 57852548,
    inputStartAmount: '3546199835650100800',
    inputCurve: '{"relativeBlocks":[80],"relativeAmounts":["0"]}',
    outputStartAmount: '2669433635012399721',
    outputCurve: '{"relativeBlocks":[80],"relativeAmounts":["66735840875309994"]}',
    startingBaseFee: '0',
  },
})

const FILL_LINE = JSON.stringify({
  level: 'INFO',
  message: 'Fill Info',
  service: 'GoudaService',
  timestamp: '2026-09-08T17:03:35.000Z',
  orderInfo: {
    orderStatus: 'filled',
    orderHash: '0xd5568db42d8366a2dcf23a7bc0562797eaa7a1c4e314247636a256dab6938815',
    orderType: 'Dutch_V3',
    quoteId: '8d63f199-5d13-4555-8a2f-055b0f56ce69',
    filler: '0x40132E775E14EF3a946FA5624468715456FA0bE4',
    fillTimestamp: 1788887013,
    fillTimeBlocks: 3,
    logTime: '1788887015',
  },
})

const CANCELLED_LINE = JSON.stringify({
  level: 'INFO',
  message: 'Analytics Message',
  orderInfo: { orderHash: '0xabc', quoteId: undefined, orderType: 'Dutch_V2', orderStatus: 'cancelled' },
})

describe('analytics firehose processor', () => {
  beforeAll(() => log.setLogLevel('SILENT'))

  describe('unwrapAnalyticsRecord', () => {
    it('emits only the body of a posted-order line', () => {
      expect(unwrapAnalyticsRecord(POSTED_ORDER_LINE)).toEqual(JSON.stringify(JSON.parse(POSTED_ORDER_LINE).body))
    })

    it('emits only the orderInfo of fill and cancellation lines', () => {
      expect(unwrapAnalyticsRecord(FILL_LINE)).toEqual(JSON.stringify(JSON.parse(FILL_LINE).orderInfo))
      expect(JSON.parse(unwrapAnalyticsRecord(CANCELLED_LINE))).toEqual({
        orderHash: '0xabc',
        orderType: 'Dutch_V2',
        orderStatus: 'cancelled',
      })
    })

    it('rejects a line with neither field, so the record is not silently loaded as an envelope', () => {
      expect(() => unwrapAnalyticsRecord(JSON.stringify({ level: 'INFO', message: 'hello' }))).toThrow()
    })
  })

  describe('transformRecord', () => {
    it('joins the events of one CloudWatch record with newlines, matching the previous Firehose layout', () => {
      const out = transformRecord(cloudWatchRecord('r1', dataMessage(POSTED_ORDER_LINE, POSTED_ORDER_LINE)))
      expect(out.result).toEqual('Ok')
      const body = JSON.stringify(JSON.parse(POSTED_ORDER_LINE).body)
      expect(Buffer.from(out.data as string, 'base64').toString('utf-8')).toEqual(`${body}\n${body}`)
    })

    it('drops CloudWatch control messages', () => {
      expect(transformRecord(cloudWatchRecord('r1', { messageType: 'CONTROL_MESSAGE', logEvents: [] }))).toEqual({
        recordId: 'r1',
        result: 'Dropped',
      })
    })

    it('fails the whole record if any event cannot be unwrapped', () => {
      const out = transformRecord(cloudWatchRecord('r1', dataMessage(FILL_LINE, '{"message":"no payload"}')))
      expect(out).toEqual({ recordId: 'r1', result: 'ProcessingFailed' })
    })

    it('fails records with an unknown message type', () => {
      expect(transformRecord(cloudWatchRecord('r1', { messageType: 'SOMETHING_ELSE' })).result).toEqual(
        'ProcessingFailed'
      )
    })
  })

  describe('processFirehoseEvent', () => {
    it('returns one result per input record, preserving ids and order', () => {
      const { records } = processFirehoseEvent({
        records: [
          cloudWatchRecord('a', dataMessage(POSTED_ORDER_LINE)),
          cloudWatchRecord('b', { messageType: 'CONTROL_MESSAGE' }),
          cloudWatchRecord('c', dataMessage(FILL_LINE)),
        ],
      })
      expect(records.map((r) => [r.recordId, r.result])).toEqual([
        ['a', 'Ok'],
        ['b', 'Dropped'],
        ['c', 'Ok'],
      ])
    })

    it('marks records past the response size limit as failed instead of exceeding it', () => {
      const big = JSON.stringify({ body: { blob: 'x'.repeat(2_000_000) } })
      const { records } = processFirehoseEvent({
        records: [
          cloudWatchRecord('a', dataMessage(big)),
          cloudWatchRecord('b', dataMessage(big)),
          cloudWatchRecord('c', dataMessage(big)),
        ],
      })
      const okBytes = records.filter((r) => r.result === 'Ok').reduce((n, r) => n + (r.data?.length ?? 0), 0)
      expect(okBytes).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
      expect(records.map((r) => r.result)).toEqual(['Ok', 'Ok', 'ProcessingFailed'])
    })
  })
})
