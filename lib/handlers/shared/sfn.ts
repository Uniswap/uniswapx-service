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
}

export async function kickoffOrderTrackingSfn(
  sfnInput: OrderTrackingSfnInput,
  stateMachineArn: string
) {
  log.info('starting state machine')
  const region = checkDefined(process.env['REGION'], 'REGION is undefined')
  const sfnClient = new SFNClient({ region: region })
  
  // Use runIndex if provided, otherwise start with 0 for first execution
  const nameSuffix = sfnInput.runIndex !== undefined ? sfnInput.runIndex : 0
  
  // Ensure runIndex is always included in the input for consistency
  const inputWithRunIndex = {
    ...sfnInput,
    runIndex: sfnInput.runIndex !== undefined ? sfnInput.runIndex : 0
  }
  
  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn: stateMachineArn,
    input: JSON.stringify(inputWithRunIndex),
    name: sfnInput.orderHash + '_' + nameSuffix,
  })
  log.info('Starting state machine execution', { startExecutionCommand })
  await sfnClient.send(startExecutionCommand)
}
