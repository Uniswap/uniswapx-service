import { FirehoseClient, FirehoseClientConfig, PutRecordCommand } from '@aws-sdk/client-firehose'
import { checkDefined } from '../../preconditions/preconditions'

// PutRecord normally answers in tens of milliseconds, and a post awaits it alongside the tracker
// start, so these bound how long a stalled put can hold the response. One attempt: a failed put
// falls back to the log line rather than risking a second copy of a record that did land.
export const FIREHOSE_CONNECTION_TIMEOUT_MS = 500
export const FIREHOSE_REQUEST_TIMEOUT_MS = 1_000

// The one call the posted-order analytics sink makes, so tests can pass a closure fake.
export type FirehoseRecordWriter = {
  putRecord(streamName: string, data: Uint8Array): Promise<void>
}

export type FirehoseClientOptions = {
  region: string
  connectionTimeoutMs?: number
  // An idle-socket timeout, not a total deadline: it resets whenever bytes arrive.
  requestTimeoutMs?: number
  // Tests point the client at a local server.
  endpoint?: string
  credentials?: FirehoseClientConfig['credentials']
}

export function createFirehoseRecordWriter({
  region,
  connectionTimeoutMs = FIREHOSE_CONNECTION_TIMEOUT_MS,
  requestTimeoutMs = FIREHOSE_REQUEST_TIMEOUT_MS,
  endpoint,
  credentials,
}: FirehoseClientOptions): FirehoseRecordWriter & { destroy(): void } {
  const client = new FirehoseClient({
    region,
    endpoint,
    credentials,
    maxAttempts: 1,
    requestHandler: { connectionTimeout: connectionTimeoutMs, requestTimeout: requestTimeoutMs },
  })
  return {
    async putRecord(streamName, data) {
      await client.send(new PutRecordCommand({ DeliveryStreamName: streamName, Record: { Data: data } }))
    },
    destroy: () => client.destroy(),
  }
}

// Reuse a single client across invocations: a client per post pays a fresh TLS handshake.
let sharedWriter: FirehoseRecordWriter | undefined

// The shared writer, built on first use rather than at import.
export const sharedFirehoseRecordWriter: FirehoseRecordWriter = {
  putRecord: (streamName, data) => {
    sharedWriter =
      sharedWriter ?? createFirehoseRecordWriter({ region: checkDefined(process.env['REGION'], 'REGION is undefined') })
    return sharedWriter.putRecord(streamName, data)
  },
}
