import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { LambdaStack } from '../../../bin/stacks/lambda-stack'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { STAGE } from '../../../lib/util/stage'

// Synthesizing LambdaStack bundles every handler with esbuild, which is slow.
jest.setTimeout(300 * 1000)

describe('LambdaStack env vars', () => {
  const buildTemplate = (stage: STAGE) => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '123456789012', region: 'us-east-2' } })
    const kmsKey = new cdk.aws_kms.Key(parent, 'TestKey')
    const stack = new LambdaStack(parent, 'TestLambdaStack', {
      provisionedConcurrency: 0,
      stage,
      envVars: {},
      kmsKey,
      tableCapacityConfig: {} as never,
    })
    return Template.fromStack(stack)
  }

  const postOrderEnv = (t: Template): Record<string, unknown> => {
    const fns = t.findResources('AWS::Lambda::Function')
    const entry = Object.entries(fns).find(([id]) => id.startsWith('PostOrder'))
    expect(entry).toBeDefined()
    return (entry![1] as any).Properties.Environment.Variables
  }

  it('publishes a STATE_MACHINE_NAMES entry per chain with no "undefined" values', () => {
    const vars = postOrderEnv(buildTemplate(STAGE.BETA))
    const names = vars.STATE_MACHINE_NAMES

    // The value is a CloudFormation Fn::Join over Fn::GetAtt tokens, so assert
    // on the serialized intrinsic rather than a plain string.
    const serialized = JSON.stringify(names)

    // The original incident: the CDK read an unpopulated map, so every chain
    // interpolated to the literal string "undefined" and every StartExecution
    // failed against :stateMachine:undefined.
    expect(serialized).not.toContain('undefined')
    expect(serialized).toContain('Fn::GetAtt')

    // One "<chainId>":" fragment per supported chain.
    for (const chainId of SUPPORTED_CHAINS) {
      expect(serialized).toContain(`\\"${chainId}\\":\\"`)
    }
  })

  it('does not publish one env var per chain', () => {
    const vars = postOrderEnv(buildTemplate(STAGE.BETA))
    // The per-chain STATE_MACHINE_ARN_<chainId> shape is what exhausted the
    // 4KB environment limit. Deployed sizes depend on token values resolved at
    // deploy time and cannot be measured here, so guard the shape instead.
    const perChainKeys = Object.keys(vars).filter((k) => /^STATE_MACHINE_ARN_/.test(k))
    expect(perChainKeys).toEqual([])
  })

  it('alarms in prod when no order trackers start, treating missing data as breaching', () => {
    buildTemplate(STAGE.PROD).hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: `GoudaService-SEV2-${STAGE.PROD}-NoOrderTrackersStarted`,
      TreatMissingData: 'breaching',
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 1,
    })
  })

  it('alarms on post-persist failures, the only signal that tracking broke', () => {
    buildTemplate(STAGE.BETA).hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: `GoudaService-SEV3-${STAGE.BETA}-PostOrderPostPersistFailure`,
      MetricName: 'PostOrderPostPersistFailure',
    })
  })
})
