import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { DynamoStack, TableCapacityConfig } from '../../../bin/stacks/dynamo-stack'

const CHATBOT = 'arn:aws:sns:us-east-2:111111111111:SlackChatbotTopic'
const INCIDENT_IO = 'arn:aws:sns:us-east-2:222222222222:CloudWatch-alerts-incident-io'

const onDemand: TableCapacityConfig = {
  order: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  limitOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  relayOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  nonce: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  quoteMetadata: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  unimindParameters: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
}

type AlarmResource = {
  Properties: {
    AlarmName: string
    AlarmActions?: unknown[]
    OKActions?: unknown[]
    TreatMissingData?: string
    Threshold?: number
    Period?: number
    Statistic?: string
    Metrics?: { MetricStat?: { Metric: { MetricName: string; Dimensions?: { Name: string; Value: unknown }[] } } }[]
    MetricName?: string
    Dimensions?: { Name: string; Value: unknown }[]
  }
}

describe('DynamoStack alarms', () => {
  const build = (topics: { chatbotSNSArn?: string; incidentIoSNSArn?: string } = {}) => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    const stack = new DynamoStack(parent, 'TestDynamo', { tableCapacityConfig: onDemand, ...topics })
    const alarms = Object.values(Template.fromStack(stack).findResources('AWS::CloudWatch::Alarm')) as AlarmResource[]
    return { stack, alarms }
  }
  const byName = (alarms: AlarmResource[], needle: string) =>
    alarms.filter((a) => JSON.stringify(a.Properties.AlarmName).includes(needle))

  it('notifies incident.io on ALARM and OK, and Slack on ALARM only', () => {
    const { alarms } = build({ chatbotSNSArn: CHATBOT, incidentIoSNSArn: INCIDENT_IO })
    expect(alarms.length).toBeGreaterThan(0)
    for (const alarm of alarms) {
      const alarmActions = JSON.stringify(alarm.Properties.AlarmActions ?? [])
      const okActions = JSON.stringify(alarm.Properties.OKActions ?? [])
      expect(alarmActions).toContain(CHATBOT)
      expect(alarmActions).toContain(INCIDENT_IO)
      // incident.io only resolves an alert on OK; without it every later ALARM is folded into
      // the first one and pages nobody.
      expect(okActions).toContain(INCIDENT_IO)
      expect(okActions).not.toContain(CHATBOT)
    }
  })

  it('still synthesizes with no topics configured', () => {
    const { alarms } = build()
    expect(alarms.length).toBeGreaterThan(0)
    for (const alarm of alarms) {
      expect(alarm.Properties.AlarmActions ?? []).toHaveLength(0)
    }
  })

  it('creates no consumed-capacity alarms for pay-per-request tables', () => {
    // "80 units per 5 minutes" is always exceeded on an on-demand table, so these sat in ALARM
    // forever and could never transition to notify anything.
    const { alarms } = build()
    expect(byName(alarms, 'CapacityAlarm')).toHaveLength(0)
  })

  it('alarms provisioned tables at 80% of their capacity over the period, not at 80 units', () => {
    const provisioned: TableCapacityConfig = {
      ...onDemand,
      nonce: { billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED, readCapacity: 2000, writeCapacity: 1000 },
    }
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    const stack = new DynamoStack(parent, 'TestDynamo', { tableCapacityConfig: provisioned })
    const alarms = Object.values(Template.fromStack(stack).findResources('AWS::CloudWatch::Alarm')) as AlarmResource[]

    const capacity = byName(alarms, 'CapacityAlarm')
    expect(capacity.map((a) => a.Properties.AlarmName).sort()).toEqual([
      'GoudaService-SEV3-Nonces-ReadCapacityAlarm',
      'GoudaService-SEV3-Nonces-WriteCapacityAlarm',
    ])
    const read = byName(alarms, 'Nonces-ReadCapacityAlarm')[0]
    const write = byName(alarms, 'Nonces-WriteCapacityAlarm')[0]
    // 80% x 2000 RCU/s x 300 s
    expect(read.Properties.Threshold).toEqual(480000)
    expect(write.Properties.Threshold).toEqual(240000)
    expect(read.Properties.Statistic).toEqual('Sum')
    expect(read.Properties.Period).toEqual(300)
  })

  it('treats missing throttle and error datapoints as healthy', () => {
    // DynamoDB only publishes ThrottledRequests / SystemErrors when non-zero; the default
    // "missing" handling froze the Orders alarms in ALARM for weeks after the throttling stopped.
    const { alarms } = build()
    for (const alarm of [...byName(alarms, 'ThrottlesAlarm'), ...byName(alarms, 'SystemErrorsAlarm')]) {
      expect(alarm.Properties.TreatMissingData).toEqual('notBreaching')
    }
  })

  it('alarms on read throttles for each hot GSI of the Orders table', () => {
    const { alarms } = build({ incidentIoSNSArn: INCIDENT_IO })
    const gsiAlarms = byName(alarms, 'GSI-')
    const indexes = gsiAlarms
      .map((a) => a.Properties.Dimensions?.find((d) => d.Name === 'GlobalSecondaryIndexName')?.Value)
      .sort()
    expect(indexes).toEqual(['chainId-createdAt-all', 'chainId_orderStatus-createdAt-all', 'orderStatus-createdAt-all'])
    for (const alarm of gsiAlarms) {
      expect(alarm.Properties.MetricName).toEqual('ReadThrottleEvents')
      expect(alarm.Properties.TreatMissingData).toEqual('notBreaching')
      expect(JSON.stringify(alarm.Properties.OKActions)).toContain(INCIDENT_IO)
    }
  })
})
