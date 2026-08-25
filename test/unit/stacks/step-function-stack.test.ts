import * as cdk from 'aws-cdk-lib'
import { StepFunctionStack } from '../../../bin/stacks/step-function-stack'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { STAGE } from '../../../lib/util/stage'

describe('StepFunctionStack', () => {
  const buildStack = (): StepFunctionStack => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '123456789012', region: 'us-east-2' } })
    const lambdaRole = new cdk.aws_iam.Role(parent, 'TestLambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    })
    return new StepFunctionStack(parent, 'TestStepFunctionStack', {
      envVars: {},
      stage: STAGE.BETA,
      lambdaRole,
    })
  }

  it('publishes a state machine name for every supported chain', () => {
    const stack = buildStack()
    for (const chainId of SUPPORTED_CHAINS) {
      // A missing entry interpolates into lambda-stack's STATE_MACHINE_NAMES
      // env var as the literal string "undefined", producing an ARN ending in
      // :stateMachine:undefined. StartExecution then fails, and the post-persist
      // catch swallows it, so order tracking stops silently.
      expect(stack.chainIdToStatusTrackingStateMachineName[chainId]).toBeDefined()
    }
  })

  it('keeps the name map key-aligned with the ARN map', () => {
    const stack = buildStack()
    expect(Object.keys(stack.chainIdToStatusTrackingStateMachineName).sort()).toEqual(
      Object.keys(stack.chainIdToStatusTrackingStateMachineArn).sort()
    )
  })

})
