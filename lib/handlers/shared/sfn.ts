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

//TODO: remove random for sfn name
const BIG_NUMBER = 100000000000

export async function kickoffOrderTrackingSfn(sfnInput: OrderTrackingSfnInput, stateMachineArn: string) {
  log.info('starting state machine')
  const region = checkDefined(process.env['REGION'])
  const sfnClient = new SFNClient({ region: region })
  const rand = Math.floor(Math.random() * BIG_NUMBER)
  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn: stateMachineArn,
    input: JSON.stringify(sfnInput),
    name: sfnInput.orderHash + '_' + rand,
  })
  log.info('Starting state machine execution', { startExecutionCommand })
  await sfnClient.send(startExecutionCommand)
}
