import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock, MockProxy } from 'jest-mock-extended'
import { gzipSync } from 'node:zlib'
import {
  DutchV2OrderEntity,
  DutchV3OrderEntity,
  ORDER_STATUS,
  PriorityOrderEntity,
  UniswapXOrderEntity,
} from '../../../lib/entities'
import { transformRecord } from '../../../lib/handlers/analytics-firehose-processor/processor'
import { createFirehoseRecordWriter, FirehoseRecordWriter } from '../../../lib/handlers/shared/firehose'
import { log } from '../../../lib/Logging'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { PostContext } from '../../../lib/services/OrderPoster'
import { FirehosePostedOrderAnalytics, LogLinePostedOrderAnalytics } from '../../../lib/services/posted-order-analytics'
import { RecordingMetrics } from '../../fakes/metrics'
import { SilentServer, silentServerClientOptions } from '../../fakes/silent-server'

const STREAM = 'GoudaService-test-PostedOrdersDirect'

const shared = {
  encodedOrder: '0x01',
  signature: '0x02',
  nonce: '1',
  orderHash: '0x03',
  orderStatus: ORDER_STATUS.OPEN,
  chainId: 8453,
  offerer: '0x04',
  reactor: '0x05',
  cosignature: '0x06',
  deadline: 300,
  filler: '0x1111111111111111111111111111111111111111',
}

// No quoteId: an absent field must stay absent on both paths.
const DUTCH_V2: DutchV2OrderEntity = {
  ...shared,
  type: OrderType.Dutch_V2,
  decayStartTime: 100,
  decayEndTime: 200,
  input: { token: '0xInputToken', startAmount: '5000', endAmount: '6000' },
  outputs: [
    { token: '0xOutputToken', startAmount: '7000', endAmount: '8000', recipient: '0xSwapper' },
    { token: '0xOutputToken', startAmount: '10', endAmount: '10', recipient: '0xFee' },
  ],
  cosignerData: {
    decayStartTime: 100,
    decayEndTime: 200,
    exclusiveFiller: '0x00',
    inputOverride: '0',
    outputOverrides: ['0'],
  },
}

const curve = (amount: string) => ({ relativeBlocks: [1, 2], relativeAmounts: [amount, '-1'] })
const DUTCH_V3: DutchV3OrderEntity = {
  ...shared,
  quoteId: 'quote-v3',
  type: OrderType.Dutch_V3,
  startingBaseFee: '7',
  cosignerData: { decayStartBlock: 12, exclusiveFiller: '0x00', inputOverride: '0', outputOverrides: ['0'] },
  input: {
    token: '0xInputToken',
    startAmount: '5000',
    curve: curve('0'),
    maxAmount: '5000',
    adjustmentPerGweiBaseFee: '0',
  },
  outputs: [
    {
      token: '0xOutputToken',
      startAmount: '2000000000000000000',
      curve: curve('3'),
      minAmount: '1',
      recipient: '0xSwapper',
      adjustmentPerGweiBaseFee: '0',
    },
  ],
}

const PRIORITY: PriorityOrderEntity = {
  ...shared,
  quoteId: 'quote-priority',
  type: OrderType.Priority,
  auctionStartBlock: 1_234_567,
  baselinePriorityFeeWei: '0',
  cosignerData: { auctionTargetBlock: 1_234_560 },
  input: { token: '0xInputToken', amount: '5000', mpsPerPriorityFeeWei: '0' },
  outputs: [{ token: '0xOutputToken', amount: '9000', mpsPerPriorityFeeWei: '1', recipient: '0xSwapper' }],
}

const ORDERS: [string, UniswapXOrderEntity, OrderType][] = [
  ['Dutch V2', DUTCH_V2, OrderType.Dutch_V2],
  ['Dutch V3', DUTCH_V3, OrderType.Dutch_V3],
  ['Priority', PRIORITY, OrderType.Priority],
]

// The production logger, its stdout captured.
function capturedLogger(): { logger: Logger; lines: string[]; stop: () => void } {
  const lines: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(chunk.toString().trimEnd())
    return true
  })
  return { logger: new Logger({ serviceName: 'GoudaService' }), lines, stop: () => spy.mockRestore() }
}

const records = (logger: Logger) => new AnalyticsService(logger, () => '1788886866', getAddress)

// What the old log path wrote to S3 for these lines: the processor's output for one batch.
function processed(lines: string[]): string {
  const payload = {
    messageType: 'DATA_MESSAGE',
    logEvents: lines.map((message, i) => ({ id: `${i}`, timestamp: i, message })),
  }
  const result = transformRecord({
    recordId: '1',
    data: gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64'),
  })
  return Buffer.from(result.data ?? '', 'base64').toString('utf-8')
}

function context(): { logger: MockProxy<PostContext['logger']>; metrics: RecordingMetrics } {
  return { logger: mock<PostContext['logger']>(), metrics: new RecordingMetrics() }
}

class RecordingWriter implements FirehoseRecordWriter {
  public readonly puts: { streamName: string; data: string }[] = []
  public failWith?: Error

  async putRecord(streamName: string, data: Uint8Array): Promise<void> {
    if (this.failWith) throw this.failWith
    this.puts.push({ streamName, data: Buffer.from(data).toString('utf-8') })
  }
}

describe('FirehosePostedOrderAnalytics', () => {
  it.each(ORDERS)('puts the bytes the old log path delivered for a %s order, plus a newline', async (_, order, type) => {
    const { logger, lines, stop } = capturedLogger()
    records(logger).logOrderPosted(order, type)
    const writer = new RecordingWriter()

    await new FirehosePostedOrderAnalytics(records(logger), STREAM, writer).send(context(), order, type)

    stop()
    expect(lines).toHaveLength(1)
    expect(writer.puts).toEqual([{ streamName: STREAM, data: processed(lines) + '\n' }])
  })

  it('counts the record and logs it for the dashboard', async () => {
    const ctx = context()
    const writer = new RecordingWriter()
    const { logger, lines, stop } = capturedLogger()

    await new FirehosePostedOrderAnalytics(records(logger), STREAM, writer).send(ctx, DUTCH_V2, OrderType.Dutch_V2)

    stop()
    expect(lines).toEqual([])
    expect(ctx.metrics.calls.map(([name]) => name)).toEqual(['PostedOrderAnalyticsSent'])
    expect(ctx.logger.info).toHaveBeenCalledWith('Sent posted order analytics record', {
      body: JSON.parse(writer.puts[0].data),
    })
  })

  it('drops and counts the record when the put fails, and resolves', async () => {
    const { logger, lines, stop } = capturedLogger()
    const writer = new RecordingWriter()
    writer.failWith = new Error('ResourceNotFoundException')
    const ctx = context()

    await new FirehosePostedOrderAnalytics(records(logger), STREAM, writer).send(ctx, PRIORITY, OrderType.Priority)

    stop()
    expect(lines).toEqual([])
    expect(ctx.metrics.calls.map(([name]) => name)).toEqual(['PostedOrderAnalyticsDropped'])
    expect(ctx.logger.warn).toHaveBeenCalledWith('Posted order analytics put failed; dropping the record', {
      orderHash: PRIORITY.orderHash,
      err: writer.failWith,
    })
  })

  it('logs and resolves when the record cannot be built', async () => {
    const ctx = context()
    const writer = new RecordingWriter()
    const broken = { ...DUTCH_V2, outputs: [] } as UniswapXOrderEntity

    await new FirehosePostedOrderAnalytics(records(log), STREAM, writer).send(ctx, broken, OrderType.Dutch_V2)

    expect(writer.puts).toEqual([])
    expect(ctx.logger.error).toHaveBeenCalledWith('Failed to build the posted order analytics record', {
      orderHash: broken.orderHash,
      err: expect.any(TypeError),
    })
  })
})

describe('LogLinePostedOrderAnalytics', () => {
  it('writes the record as the old log line', async () => {
    const { logger, lines, stop } = capturedLogger()

    await new LogLinePostedOrderAnalytics(records(logger)).send(context(), DUTCH_V3, OrderType.Dutch_V3)

    stop()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ message: 'Analytics Message', eventType: 'OrderPosted' })
  })
})

describe('createFirehoseRecordWriter', () => {
  let server: SilentServer

  beforeEach(async () => {
    server = new SilentServer()
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('rejects a hung put with a timeout after one attempt', async () => {
    const requestTimeoutMs = 200
    const writer = createFirehoseRecordWriter({ ...silentServerClientOptions(server), requestTimeoutMs })

    const started = Date.now()
    await expect(writer.putRecord(STREAM, Buffer.from('{}\n'))).rejects.toMatchObject({ name: 'TimeoutError' })
    const elapsed = Date.now() - started
    writer.destroy()

    expect(server.connections).toBe(1)
    expect(elapsed).toBeGreaterThanOrEqual(requestTimeoutMs)
    expect(elapsed).toBeLessThan(requestTimeoutMs + 500)
  })
})
