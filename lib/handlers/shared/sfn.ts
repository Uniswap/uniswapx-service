import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
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

// Reuse a single client across invocations: constructing an SFNClient per
// order pays a fresh TLS handshake on the post-order latency-critical path.
let sfnClient: SFNClient | undefined

export async function kickoffOrderTrackingSfn(
  sfnInput: OrderTrackingSfnInput,
  stateMachineArn: string
) {
  log.info('starting state machine')
  const region = checkDefined(process.env['REGION'], 'REGION is undefined')
  sfnClient = sfnClient ?? new SFNClient({ region: region })

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
  await sfnClient.send(startExecutionCommand)
}
