import { SFNClient, SFNClientConfig, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../entities'
import { log } from '../../Logging'
import { checkDefined } from '../../preconditions/preconditions'

export type OrderTrackingSfnInput = {
  orderHash: string
  chainId: number
  orderStatus: ORDER_STATUS
  quoteId: string
  orderType: OrderType
  stateMachineArn: string
  runIndex?: number
  // Carried across execution restarts so a respawned run keeps the original
  // fill-search coverage and grace-poll progress instead of resetting them --
  // a reset window can permanently hide an already-landed fill.
  startingBlockNumber?: number
  getFillLogAttempts?: number
  deadline?: number
}

// StartExecution normally answers in well under a second. These bound a hung call so the post
// Lambda (29 s timeout) still returns the hash of an order it has already stored: worst case is
// about SFN_ATTEMPTS x SFN_REQUEST_TIMEOUT_MS plus one backoff under 100 ms, roughly 6 s. A retry is
// safe because StartExecution with the same name and input as a running execution succeeds
// without starting a second one.
export const SFN_CONNECTION_TIMEOUT_MS = 1_000
export const SFN_REQUEST_TIMEOUT_MS = 3_000
export const SFN_ATTEMPTS = 2

export type SfnClientOptions = {
  region: string
  connectionTimeoutMs?: number
  // An idle-socket timeout, not a total deadline: it resets whenever bytes arrive.
  requestTimeoutMs?: number
  // HTTP attempts per call, the first included.
  attempts?: number
  // Tests point the client at a local server.
  endpoint?: string
  credentials?: SFNClientConfig['credentials']
}

export function createSfnClient({
  region,
  connectionTimeoutMs = SFN_CONNECTION_TIMEOUT_MS,
  requestTimeoutMs = SFN_REQUEST_TIMEOUT_MS,
  attempts = SFN_ATTEMPTS,
  endpoint,
  credentials,
}: SfnClientOptions): SFNClient {
  return new SFNClient({
    region,
    endpoint,
    credentials,
    // The pinned SDK (3.341) makes maxAttempts + 1 attempts: its retry strategy compares the retry
    // count, not the attempt count, against maxAttempts. The createSfnClient tests count the
    // attempts that reach the server, so an SDK bump that fixes this fails them loudly.
    maxAttempts: attempts - 1,
    requestHandler: new NodeHttpHandler({ connectionTimeout: connectionTimeoutMs, requestTimeout: requestTimeoutMs }),
  })
}

// The one call kickoffOrderTrackingSfn makes, so tests can pass a closure fake.
export type StartExecutionClient = { send(command: StartExecutionCommand): Promise<unknown> }

// Reuse a single client across invocations: constructing an SFNClient per
// order pays a fresh TLS handshake on the post-order latency-critical path.
let sfnClient: SFNClient | undefined

function sharedSfnClient(): SFNClient {
  const region = checkDefined(process.env['REGION'], 'REGION is undefined')
  sfnClient = sfnClient ?? createSfnClient({ region })
  return sfnClient
}

export async function kickoffOrderTrackingSfn(
  sfnInput: OrderTrackingSfnInput,
  stateMachineArn: string,
  client: StartExecutionClient = sharedSfnClient()
) {
  log.info('starting state machine')

  // Use runIndex if provided, otherwise fall back to random number
  const BIG_NUMBER = 1000000000000
  const rand = Math.floor(Math.random() * BIG_NUMBER)
  const nameSuffix = sfnInput.runIndex !== undefined ? sfnInput.runIndex : rand
  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn: stateMachineArn,
    input: JSON.stringify(sfnInput),
    name: sfnInput.orderHash + '_' + nameSuffix,
  })
  log.info('Starting state machine execution', { startExecutionCommand })
  await client.send(startExecutionCommand)
}
