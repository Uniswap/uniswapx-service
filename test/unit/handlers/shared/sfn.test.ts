import { StartExecutionCommand } from '@aws-sdk/client-sfn'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../../lib/entities'
import {
  createSfnClient,
  kickoffOrderTrackingSfn,
  SFN_ATTEMPTS,
  SFN_REQUEST_TIMEOUT_MS,
} from '../../../../lib/handlers/shared/sfn'
import { log } from '../../../../lib/Logging'
import { ChainId } from '../../../../lib/util/chain'
import { SilentServer, silentServerClientOptions } from '../../../fakes/silent-server'

const MOCK_ARN_1 = 'arn:aws:states:region:123456789012:stateMachine:MOCK_SM_1'

// The SDK waits under 100 ms x 2^n before retry n (from 0), so under 300 ms across the two retries
// these tests can make; the rest is scheduling slack.
const BACKOFF_ALLOWANCE_MS = 500

const sfnInput = {
  orderHash: '0xhash',
  chainId: ChainId.MAINNET,
  quoteId: 'quoteId',
  orderStatus: ORDER_STATUS.OPEN,
  orderType: OrderType.Dutch,
  stateMachineArn: MOCK_ARN_1,
  runIndex: 0,
}

describe('kickoffOrderTrackingSfn', () => {
  beforeAll(() => {
    process.env['REGION'] = 'region'
    log.setLogLevel('SILENT')
  })

  it('should call StepFunctions.startExecution method with the correct params', async () => {
    const sent: StartExecutionCommand[] = []
    const send = async (command: StartExecutionCommand) => {
      sent.push(command)
    }

    await kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1, { send })

    expect(sent).toHaveLength(1)
    expect(sent[0].input).toStrictEqual({
      stateMachineArn: MOCK_ARN_1,
      input: JSON.stringify(sfnInput),
      name: '0xhash_0',
    })
  })
})

describe('createSfnClient', () => {
  let server: SilentServer

  beforeEach(async () => {
    server = new SilentServer()
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('rejects a hung StartExecution with a timeout after the capped attempts', async () => {
    const requestTimeoutMs = 200
    const attempts = 3
    const client = createSfnClient({ ...silentServerClientOptions(server), requestTimeoutMs, attempts })

    const started = Date.now()
    await expect(kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1, client)).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    const elapsed = Date.now() - started
    client.destroy()

    expect(server.connections).toBe(attempts)
    expect(elapsed).toBeGreaterThanOrEqual(attempts * requestTimeoutMs)
    expect(elapsed).toBeLessThan(attempts * requestTimeoutMs + BACKOFF_ALLOWANCE_MS)
  })

  it('makes a single attempt when asked for one', async () => {
    const client = createSfnClient({ ...silentServerClientOptions(server), requestTimeoutMs: 200, attempts: 1 })

    await expect(kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1, client)).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    client.destroy()

    expect(server.connections).toBe(1)
  })

  it('bounds a hung StartExecution with the production defaults', async () => {
    const client = createSfnClient(silentServerClientOptions(server))

    const started = Date.now()
    await expect(kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1, client)).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    const elapsed = Date.now() - started
    client.destroy()

    expect(server.connections).toBe(SFN_ATTEMPTS)
    expect(elapsed).toBeLessThan(SFN_ATTEMPTS * SFN_REQUEST_TIMEOUT_MS + BACKOFF_ALLOWANCE_MS)
  }, 15_000)
})
