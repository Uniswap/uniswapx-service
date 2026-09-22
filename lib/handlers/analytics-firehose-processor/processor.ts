import { gunzipSync } from 'node:zlib'
import { log } from '../../Logging'

export type FirehoseRecord = { recordId: string; data: string }
export type FirehoseEvent = { records: FirehoseRecord[] }
export type FirehoseResultRecord = {
  recordId: string
  result: 'Ok' | 'Dropped' | 'ProcessingFailed'
  data?: string
}

type CloudWatchLogsPayload = {
  messageType: 'CONTROL_MESSAGE' | 'DATA_MESSAGE' | string
  logEvents?: { message: string }[]
}

// Firehose rejects a transformation response larger than 6 MiB. Records past this projected
// size are marked ProcessingFailed so the rest of the batch still delivers.
export const MAX_RESPONSE_BYTES = 6_000_000

/**
 * Reduces one analytics log line to the record Data Eng loads: the `body` of an
 * "Analytics Message" (posted orders) or the `orderInfo` of a "Fill Info" / terminal-state line.
 */
export function unwrapAnalyticsRecord(message: string): string {
  const parsed = JSON.parse(message)
  const record = parsed.body ?? parsed.orderInfo
  if (record === undefined) throw new Error('log event has neither body nor orderInfo')
  return JSON.stringify(record)
}

export function transformRecord(record: FirehoseRecord): FirehoseResultRecord {
  const payload: CloudWatchLogsPayload = JSON.parse(gunzipSync(Buffer.from(record.data, 'base64')).toString('utf-8'))
  if (payload.messageType === 'CONTROL_MESSAGE') {
    return { recordId: record.recordId, result: 'Dropped' }
  }
  if (payload.messageType !== 'DATA_MESSAGE' || !payload.logEvents) {
    return { recordId: record.recordId, result: 'ProcessingFailed' }
  }
  try {
    const lines = payload.logEvents.map((event) => unwrapAnalyticsRecord(event.message)).join('\n')
    return { recordId: record.recordId, result: 'Ok', data: Buffer.from(lines, 'utf-8').toString('base64') }
  } catch (e) {
    log.error('Failed to unwrap analytics log events', { error: e instanceof Error ? e.message : e })
    return { recordId: record.recordId, result: 'ProcessingFailed' }
  }
}

export function processFirehoseEvent(event: FirehoseEvent): { records: FirehoseResultRecord[] } {
  let projectedBytes = 0
  const records = event.records.map((record) => {
    const result = transformRecord(record)
    if (result.data === undefined) return result
    projectedBytes += result.data.length + result.recordId.length
    if (projectedBytes > MAX_RESPONSE_BYTES) {
      return { recordId: record.recordId, result: 'ProcessingFailed' as const }
    }
    return result
  })
  const counts = records.reduce((acc, r) => ({ ...acc, [r.result]: acc[r.result] + 1 }), {
    Ok: 0,
    Dropped: 0,
    ProcessingFailed: 0,
  })
  log.info('Processed analytics records', { input: event.records.length, ...counts })
  return { records }
}
