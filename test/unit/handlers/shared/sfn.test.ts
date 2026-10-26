import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mockClient } from 'aws-sdk-client-mock'
import { ORDER_STATUS } from '../../../../lib/entities'
import { kickoffOrderTrackingSfn } from '../../../../lib/handlers/shared/sfn'
import { log } from '../../../../lib/Logging'
import { ChainId } from '../../../../lib/util/chain'

// kickoffOrderTrackingSfn keeps one module-level SFNClient, so stubbing the client class is the
// only seam until the client is injected.
const mockSfnClient = mockClient(SFNClient)

const MOCK_ARN_1 = 'arn:aws:states:region:123456789012:stateMachine:MOCK_SM_1'

describe('kickoffOrderTrackingSfn', () => {
  beforeAll(() => {
    process.env['REGION'] = 'region'
    log.setLogLevel('SILENT')
  })

  afterEach(() => {
    mockSfnClient.reset()
  })

  it('should call StepFunctions.startExecution method with the correct params', async () => {
    const sfnInput = {
      orderHash: '0xhash',
      chainId: ChainId.MAINNET,
      quoteId: 'quoteId',
      orderStatus: ORDER_STATUS.OPEN,
      orderType: OrderType.Dutch,
      stateMachineArn: MOCK_ARN_1,
      runIndex: 0,
    }
    await kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1)
    expect(mockSfnClient.calls()).toHaveLength(1)

    expect(mockSfnClient.call(0).args[0].input).toStrictEqual(
      new StartExecutionCommand({
        stateMachineArn: MOCK_ARN_1,
        input: JSON.stringify(sfnInput),
        name: expect.any(String),
      }).input
    )
  })
})
