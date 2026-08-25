import * as cdk from 'aws-cdk-lib'
import { StepFunctionStack } from '../../../bin/stacks/step-function-stack'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { STAGE } from '../../../lib/util/stage'

describe('StepFunctionStack', () => {
  const buildStack = (): StepFunctionStack => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent')
    const lambdaRole = new cdk.aws_iam.Role(parent, 'TestLambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    })
    return new StepFunctionStack(parent, 'TestStepFunctionStack', {
      envVars: {},
      stage: STAGE.BETA,
      lambdaRole,
    })
  }

  it('publishes a status-tracking state machine name for every supported chain', () => {
    const stack = buildStack()
    for (const chainId of SUPPORTED_CHAINS) {
      const name = stack.chainIdToStatusTrackingStateMachineName[chainId]
      expect(name).toBeDefined()
      // A missing map entry interpolated into lambda-stack's STATE_MACHINE_NAMES
      // env var becomes the literal string "undefined", which silently breaks
      // order tracking at runtime.
      expect(name).not.toContain('undefined')
    }
  })

  it('keeps the name map aligned with the ARN map', () => {
    const stack = buildStack()
    expect(Object.keys(stack.chainIdToStatusTrackingStateMachineName).sort()).toEqual(
      Object.keys(stack.chainIdToStatusTrackingStateMachineArn).sort()
    )
  })
})
