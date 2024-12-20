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
}

export async function kickoffOrderTrackingSfn(
  sfnInput: OrderTrackingSfnInput,
  stateMachineArn: string,
  retryCount = 0
) {
  log.info('starting state machine')
  const region = checkDefined(process.env['REGION'], 'REGION is undefined')
  const sfnClient = new SFNClient({ region: region })
  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn: stateMachineArn,
    input: JSON.stringify(sfnInput),
    name: sfnInput.orderHash + '_' + retryCount,
  })
  log.info('Starting state machine execution', { startExecutionCommand })
  await sfnClient.send(startExecutionCommand)
}
