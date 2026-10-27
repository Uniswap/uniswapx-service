import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

// The order store's calls answer in milliseconds in-region. These bound a stuck call well inside
// the post Lambda's 29 s: worst case about STORE_ATTEMPTS x STORE_REQUEST_TIMEOUT_MS plus
// backoff, roughly 10 s. aws-sdk v2, which these calls used before, sets neither timeout and
// retries DynamoDB up to 10 times.
export const STORE_CONNECTION_TIMEOUT_MS = 1_000
export const STORE_REQUEST_TIMEOUT_MS = 3_000
export const STORE_ATTEMPTS = 3

export type StoreClientOptions = {
  connectionTimeoutMs?: number
  // An idle-socket timeout, not a total deadline: it resets whenever bytes arrive.
  requestTimeoutMs?: number
  // HTTP attempts per call, the first included.
  attempts?: number
  // Unset in Lambda, where the region and credentials come from the environment.
  region?: string
  endpoint?: string
  credentials?: DynamoDBClientConfig['credentials']
}

export function createStoreClient({
  connectionTimeoutMs = STORE_CONNECTION_TIMEOUT_MS,
  requestTimeoutMs = STORE_REQUEST_TIMEOUT_MS,
  attempts = STORE_ATTEMPTS,
  region,
  endpoint,
  credentials,
}: StoreClientOptions = {}): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      endpoint,
      credentials,
      maxAttempts: attempts,
      // Options, not a handler instance: in Lambda the client is the runtime's SDK (CDK leaves
      // @aws-sdk/* out of the bundle), so it must build a handler from its own smithy version.
      requestHandler: { connectionTimeout: connectionTimeoutMs, requestTimeout: requestTimeoutMs },
    }),
    // dynamodb-toolbox never wrote an undefined attribute
    { marshallOptions: { removeUndefinedValues: true } }
  )
}

// One client per Lambda, reused across invocations so warm requests skip the TLS handshake.
let sharedClient: DynamoDBDocumentClient | undefined

export function sharedStoreClient(): DynamoDBDocumentClient {
  sharedClient ??= createStoreClient()
  return sharedClient
}
