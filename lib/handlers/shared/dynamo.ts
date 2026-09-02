import { DynamoDB } from 'aws-sdk'

/**
 * Retry budget for DynamoDB reads on the polling endpoints (GET /orders, GET /limit-orders).
 *
 * aws-sdk v2 retries a throttled DynamoDB call up to 10 times with exponential backoff, so
 * one read against a hot partition can hold a Lambda execution environment for seconds.
 * On this path that is the wrong trade: the longer requests run, the more concurrent
 * environments Lambda starts, and each new environment misses the per-environment query
 * cache once per TTL -- more environments means more reads against the very partition that
 * is already throttling. Failing fast breaks that loop; the caller is a poller and will be
 * back on its next tick.
 */
export const READ_PATH_MAX_RETRIES = 2

export function createReadPathDocumentClient(): DynamoDB.DocumentClient {
  return new DynamoDB.DocumentClient({ maxRetries: READ_PATH_MAX_RETRIES })
}
