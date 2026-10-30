import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { PROD_TABLE_CAPACITY } from '../../../bin/config'
import { LambdaStack } from '../../../bin/stacks/lambda-stack'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { STAGE } from '../../../lib/util/stage'

const INCIDENT_IO_ARN = 'arn:aws:sns:us-east-2:123456789012:incident-io'
const CHATBOT_ARN = 'arn:aws:sns:us-east-2:123456789012:chatbot'

describe('LambdaStack', () => {
  const buildTemplate = (stage: STAGE): Template => {
    // An empty bundling-stacks list skips esbuild, which would otherwise bundle every handler.
    const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } })
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '123456789012', region: 'us-east-2' } })
    const stack = new LambdaStack(parent, 'TestLambdaStack', {
      provisionedConcurrency: 0,
      stage,
      envVars: {},
      kmsKey: new cdk.aws_kms.Key(parent, 'TestKey'),
      tableCapacityConfig: PROD_TABLE_CAPACITY,
      chatbotSNSArn: CHATBOT_ARN,
      incidentIoSNSArn: INCIDENT_IO_ARN,
    })
    return Template.fromStack(stack)
  }

  const postOrderEnv = (t: Template): Record<string, unknown> => {
    const fns = t.findResources('AWS::Lambda::Function')
    const entry = Object.entries(fns).find(([id]) => id.startsWith('PostOrder'))
    if (!entry) throw new Error('no PostOrder function in the template')
    return entry[1].Properties.Environment.Variables
  }

  it('publishes a STATE_MACHINE_NAMES entry per chain with no "undefined" values', () => {
    // An Fn::Join over Fn::GetAtt tokens, so assert on the serialized intrinsic. The Aug 24
    // incident read an unpopulated map: every chain interpolated to the string "undefined" and
    // every StartExecution failed against :stateMachine:undefined.
    const serialized = JSON.stringify(postOrderEnv(buildTemplate(STAGE.BETA)).STATE_MACHINE_NAMES)

    expect(serialized).not.toContain('undefined')
    expect(serialized).toContain('Fn::GetAtt')
    for (const chainId of SUPPORTED_CHAINS) {
      expect(serialized).toContain(`\\"${chainId}\\":\\"`)
    }
  })

  it('does not publish one state machine env var per chain', () => {
    // The per-chain STATE_MACHINE_ARN_<chainId> shape is what exhausted Lambda's 4KB env limit.
    const vars = postOrderEnv(buildTemplate(STAGE.BETA))
    expect(Object.keys(vars).filter((k) => k.startsWith('STATE_MACHINE_ARN_'))).toEqual([])
  })

  it('pages in prod when no order trackers start for an hour, treating missing data as breaching', () => {
    buildTemplate(STAGE.PROD).hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'GoudaService-SEV2-NoOrderTrackersStarted',
      MetricName: 'OrderTrackerStarted',
      Period: 3600,
      Threshold: 1,
      ComparisonOperator: 'LessThanThreshold',
      TreatMissingData: 'breaching',
      AlarmActions: Match.arrayWith([INCIDENT_IO_ARN]),
      OKActions: [INCIDENT_IO_ARN],
    })
  })

  it('has no tracker heartbeat outside prod', () => {
    buildTemplate(STAGE.BETA).resourcePropertiesCountIs(
      'AWS::CloudWatch::Alarm',
      { AlarmName: 'GoudaService-SEV2-NoOrderTrackersStarted' },
      0
    )
  })

  it('sends post-persist failures to Slack without paging', () => {
    buildTemplate(STAGE.PROD).hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'GoudaService-SEV3-PostOrderPostPersistFailure',
      MetricName: 'PostOrderPostPersistFailure',
      TreatMissingData: 'ignore',
      AlarmActions: [CHATBOT_ARN],
      OKActions: Match.absent(),
    })
  })

  describe('chain owner file', () => {
    const beta = buildTemplate(STAGE.BETA)
    const bucketRef = () => {
      const buckets = Object.keys(beta.findResources('AWS::S3::Bucket'))
      expect(buckets).toHaveLength(1)
      return { Ref: buckets[0] }
    }

    it('is a versioned, private, retained bucket named from the account', () => {
      beta.hasResource('AWS::S3::Bucket', {
        Properties: Match.objectLike({
          BucketName: 'uniswapx-chain-owners-123456789012',
          VersioningConfiguration: { Status: 'Enabled' },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
        }),
        DeletionPolicy: 'Retain',
      })
    })

    it('is created once with every supported chain on legacy, never overwriting an existing file', () => {
      const seeds = Object.values(beta.findResources('Custom::AWS'))
      expect(seeds).toHaveLength(1)
      expect(seeds[0].Properties.Update).toBeUndefined()
      expect(seeds[0].Properties.Delete).toBeUndefined()
      // Create is the SDK call as JSON, joined around the bucket's Ref.
      const parts = seeds[0].Properties.Create['Fn::Join'][1] as unknown[]
      const call = JSON.parse(parts.map((p) => (typeof p === 'string' ? p : 'BUCKET')).join(''))
      expect(call).toMatchObject({
        service: 'S3',
        action: 'putObject',
        parameters: { Bucket: 'BUCKET', Key: 'chain-owners.json', IfNoneMatch: '*' },
        ignoreErrorCodesMatching: 'PreconditionFailed',
      })
      expect(JSON.parse(call.parameters.Body)).toEqual({
        chains: Object.fromEntries(
          SUPPORTED_CHAINS.map((chainId) => [chainId.toString(), { posting: 'legacy', tracking: 'legacy' }])
        ),
      })
    })

    it('tells both post Lambdas and the tracker where it is, and lets them read only the file', () => {
      const fns = beta.findResources('AWS::Lambda::Function')
      for (const prefix of ['PostOrder', 'PostLimitOrder']) {
        const entry = Object.entries(fns).find(([id]) => id.startsWith(prefix))
        expect(entry?.[1].Properties.Environment.Variables.CHAIN_OWNERS_BUCKET).toEqual(bucketRef())
      }
      // The tracker Lambda is in the nested Step Functions stack; the name goes in as a parameter.
      const sfnStacks = Object.entries(beta.findResources('AWS::CloudFormation::Stack')).filter(([id]) =>
        id.includes('SfnStack')
      )
      expect(sfnStacks).toHaveLength(1)
      expect(Object.values(sfnStacks[0][1].Properties.Parameters)).toContainEqual(bucketRef())

      const statements = Object.values(beta.findResources('AWS::IAM::Policy')).flatMap(
        (p) => p.Properties.PolicyDocument.Statement
      )
      const reads = statements.filter((st: any) => JSON.stringify(st.Resource).includes('/chain-owners.json'))
      expect(reads).toContainEqual(expect.objectContaining({ Action: 's3:GetObject', Effect: 'Allow' }))
      for (const st of reads.filter((st: any) => st.Action === 's3:GetObject')) {
        expect(JSON.stringify(st.Resource)).not.toContain('/*')
      }
    })
  })
})
