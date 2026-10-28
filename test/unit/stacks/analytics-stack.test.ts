import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { FILTER_PATTERNS } from '../../../bin/constants'
import { analyticsBucketName, AnalyticsStack, DATA_ENG_LOADER_PRINCIPAL_ARN } from '../../../bin/stacks/analytics-stack'
import { STAGE } from '../../../lib/util/stage'

function buildTemplate(stage: STAGE): Template {
  const app = new cdk.App()
  const parent = new cdk.Stack(app, 'TestParent')
  const producer = (id: string) =>
    new cdk.aws_lambda.Function(parent, id, {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: cdk.aws_lambda.Code.fromInline('exports.handler = async () => {}'),
    })
  const stack = new AnalyticsStack(parent, 'TestAnalyticsStack', {
    stage,
    postOrderLambda: producer('PostOrder'),
    postLimitOrderLambda: producer('PostLimitOrder'),
    checkStatusFunction: producer('CheckOrderStatus'),
  })
  return Template.fromStack(stack)
}

describe('AnalyticsStack', () => {
  const template = buildTemplate(STAGE.PROD)

  it('creates the two buckets Data Eng reads, with stable names and retained on delete', () => {
    template.resourceCountIs('AWS::S3::Bucket', 2)
    for (const feed of ['posted-orders', 'fills'] as const) {
      template.hasResource('AWS::S3::Bucket', {
        Properties: Match.objectLike({ BucketName: analyticsBucketName(STAGE.PROD, feed) }),
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      })
    }
    expect(analyticsBucketName(STAGE.PROD, 'posted-orders')).toEqual('uniswapx-service-prod-analytics-posted-orders')
  })

  it('grants the Data Eng loader read access on both buckets via bucket policy', () => {
    const policies = template.findResources('AWS::S3::BucketPolicy')
    expect(Object.keys(policies)).toHaveLength(2)
    for (const policy of Object.values(policies)) {
      const statements = policy.Properties.PolicyDocument.Statement as { Principal: { AWS: string } }[]
      expect(statements.some((s) => s.Principal?.AWS === DATA_ENG_LOADER_PRINCIPAL_ARN)).toBe(true)
    }
  })

  it('delivers to S3 with the same buffering and layout as the previous cross-account streams', () => {
    template.resourceCountIs('AWS::KinesisFirehose::DeliveryStream', 2)
    const streams = Object.values(template.findResources('AWS::KinesisFirehose::DeliveryStream'))
    for (const stream of streams) {
      const s3 = stream.Properties.ExtendedS3DestinationConfiguration
      expect(s3.BufferingHints).toEqual({ IntervalInSeconds: 300, SizeInMBs: 5 })
      expect(s3.CompressionFormat).toEqual('UNCOMPRESSED')
      // No prefix override: Data Eng lists objects under Firehose's default YYYY/MM/DD/HH/.
      expect(s3.Prefix).toBeUndefined()
      const params = s3.ProcessingConfiguration.Processors[0].Parameters as {
        ParameterName: string
        ParameterValue: unknown
      }[]
      const byName = Object.fromEntries(params.map((p) => [p.ParameterName, p.ParameterValue]))
      expect(byName.BufferIntervalInSeconds).toEqual('60')
      expect(byName.BufferSizeInMBs).toEqual('1')
      expect(byName.NumberOfRetries).toEqual('3')
    }
  })

  it('subscribes the three producing log groups with the existing filter patterns', () => {
    template.resourceCountIs('AWS::Logs::SubscriptionFilter', 3)
    template.hasResourceProperties('AWS::Logs::SubscriptionFilter', {
      FilterPattern: FILTER_PATTERNS.TERMINAL_ORDER_STATE,
    })
    const filters = Object.values(template.findResources('AWS::Logs::SubscriptionFilter'))
    expect(filters.filter((f) => f.Properties.FilterPattern === FILTER_PATTERNS.ORDER_POSTED)).toHaveLength(2)
    // Same-account delivery: filters target the stream ARN directly, not a Logs Destination.
    for (const filter of filters) {
      const [logicalId, attr] = filter.Properties.DestinationArn['Fn::GetAtt']
      expect(logicalId).toMatch(/Stream/)
      expect(attr).toEqual('Arn')
    }
  })

  it('lets CloudWatch Logs assume the delivery role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Principal: { Service: 'logs.amazonaws.com' }, Action: 'sts:AssumeRole' }),
        ]),
      }),
    })
  })

  it('does not reserve shared bucket names or grant Data Eng for local stacks', () => {
    const local = buildTemplate(STAGE.LOCAL)
    for (const bucket of Object.values(local.findResources('AWS::S3::Bucket'))) {
      expect(bucket.Properties?.BucketName).toBeUndefined()
    }
    // enforceSSL still adds a deny-insecure-transport policy; only the cross-account read grant must be absent.
    for (const policy of Object.values(local.findResources('AWS::S3::BucketPolicy'))) {
      const statements = policy.Properties.PolicyDocument.Statement as { Principal?: { AWS?: string } }[]
      expect(statements.some((s) => s.Principal?.AWS === DATA_ENG_LOADER_PRINCIPAL_ARN)).toBe(false)
    }
  })
})
