import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { DynamoStack, TableCapacityConfig } from '../../../bin/stacks/dynamo-stack'

const CHATBOT = 'arn:aws:sns:us-east-2:111111111111:SlackChatbotTopic'
const INCIDENT_IO = 'arn:aws:sns:us-east-2:222222222222:CloudWatch-alerts-incident-io'

const onDemand: TableCapacityConfig = {
  order: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  limitOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  nonce: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
}

type AlarmResource = {
  Properties: {
    AlarmName: string
    AlarmActions?: unknown[]
    OKActions?: unknown[]
    TreatMissingData?: string
    Threshold?: number
    Period?: number
    EvaluationPeriods?: number
    DatapointsToAlarm?: number
    Statistic?: string
    Metrics?: { MetricStat?: { Metric: { MetricName: string; Dimensions?: { Name: string; Value: unknown }[] } } }[]
    MetricName?: string
    Dimensions?: { Name: string; Value: unknown }[]
  }
}

// The GSIs as CloudFormation had them before the list was shared with the repositories and
// DynamoDB Local, in creation order: [partition key, attribute type]. Pinned literally so a change
// to the shared list shows up here as an index change, not silently.
const EXPECTED_GSI_PARTITION_KEYS: [string, 'S' | 'N'][] = [
  ['offerer', 'S'],
  ['orderStatus', 'S'],
  ['filler', 'S'],
  ['filler_orderStatus', 'S'],
  ['filler_offerer', 'S'],
  ['filler_offerer_orderStatus', 'S'],
  ['offerer_orderStatus', 'S'],
  ['chainId', 'N'],
  ['chainId_filler', 'S'],
  ['chainId_orderStatus', 'S'],
  ['chainId_orderStatus_filler', 'S'],
  ['pair', 'S'],
]

describe('DynamoStack tables', () => {
  const tables = () => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    const stack = new DynamoStack(parent, 'TestDynamo', { tableCapacityConfig: onDemand })
    const resources = Template.fromStack(stack).findResources('AWS::DynamoDB::Table')
    return Object.fromEntries(Object.values(resources).map((r) => [r.Properties.TableName, r.Properties]))
  }

  it.each(['Orders', 'LimitOrders'])('gives %s the same 12 GSIs and key attributes as before', (tableName) => {
    const table = tables()[tableName]
    expect(table.GlobalSecondaryIndexes).toEqual(
      EXPECTED_GSI_PARTITION_KEYS.map(([partitionKey]) => ({
        IndexName: `${partitionKey}-createdAt-all`,
        KeySchema: [
          { AttributeName: partitionKey, KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      }))
    )
    // CDK emits each attribute the first time an index uses it, so createdAt follows offerer.
    expect(table.AttributeDefinitions).toEqual(
      [['orderHash', 'S'], ['offerer', 'S'], ['createdAt', 'N'], ...EXPECTED_GSI_PARTITION_KEYS.slice(1)].map(
        ([AttributeName, AttributeType]) => ({ AttributeName, AttributeType })
      )
    )
  })

  it('gives Nonces no GSIs', () => {
    expect(tables()['Nonces'].GlobalSecondaryIndexes).toBeUndefined()
  })
})

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

  it('notifies Slack on ALARM and never pages incident.io', () => {
    // Every DynamoDB alarm is SEV3: the Orders throttle alarms alone transitioned 22 times in
    // the two months before this change.
    const { alarms } = build({ chatbotSNSArn: CHATBOT, incidentIoSNSArn: INCIDENT_IO })
    expect(alarms.length).toBeGreaterThan(0)
    for (const alarm of alarms) {
      expect(alarm.Properties.AlarmName).toContain('-SEV3-')
      expect(JSON.stringify(alarm.Properties.AlarmActions ?? [])).toContain(CHATBOT)
      expect(JSON.stringify(alarm.Properties.AlarmActions ?? [])).not.toContain(INCIDENT_IO)
      expect(alarm.Properties.OKActions ?? []).toHaveLength(0)
    }
  })

  it('creates exactly the table and hot-GSI alarms, the same table alarms on all three tables, and one account-wide UserErrors alarm', () => {
    const { alarms } = build()
    expect(alarms.map((a) => a.Properties.AlarmName).sort()).toEqual([
      'GoudaService-SEV3-DynamoDB-UserErrorsAlarm',
      'GoudaService-SEV3-LimitOrders-ReadThrottlesAlarm',
      'GoudaService-SEV3-LimitOrders-SystemErrorsAlarm',
      'GoudaService-SEV3-LimitOrders-WriteThrottlesAlarm',
      'GoudaService-SEV3-Nonces-ReadThrottlesAlarm',
      'GoudaService-SEV3-Nonces-SystemErrorsAlarm',
      'GoudaService-SEV3-Nonces-WriteThrottlesAlarm',
      'GoudaService-SEV3-Orders-GSI-chainId_orderStatus-createdAt-all-ReadThrottles',
      'GoudaService-SEV3-Orders-GSI-orderStatus-createdAt-all-ReadThrottles',
      'GoudaService-SEV3-Orders-ReadThrottlesAlarm',
      'GoudaService-SEV3-Orders-SystemErrorsAlarm',
      'GoudaService-SEV3-Orders-WriteThrottlesAlarm',
    ])
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

  it('alarms on sustained read throttles for the hot status GSIs of the Orders table', () => {
    const { alarms } = build()
    const gsiAlarms = byName(alarms, 'GSI-')
    const indexes = gsiAlarms
      .map((a) => a.Properties.Dimensions?.find((d) => d.Name === 'GlobalSecondaryIndexName')?.Value)
      .sort()
    // chainId-createdAt-all throttles most days and is deliberately not alarmed.
    expect(indexes).toEqual(['chainId_orderStatus-createdAt-all', 'orderStatus-createdAt-all'])
    for (const alarm of gsiAlarms) {
      expect(alarm.Properties).toMatchObject({
        MetricName: 'ReadThrottleEvents',
        TreatMissingData: 'notBreaching',
        Threshold: 5000,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 3,
      })
    }
  })

  it('splits table throttle alarms into read and write operations', () => {
    const { alarms } = build()
    const ops = (needle: string) =>
      JSON.stringify(byName(alarms, needle)[0].Properties.Metrics)
        .match(/"Value":"(\w+)"/g)
        ?.filter((v) => !v.includes('Orders') && !v.includes('Nonces'))
    expect(ops('Orders-ReadThrottlesAlarm')).toEqual(
      ['GetItem', 'BatchGetItem', 'Query', 'Scan'].map((op) => `"Value":"${op}"`)
    )
    expect(ops('Orders-WriteThrottlesAlarm')).toEqual(
      ['PutItem', 'UpdateItem', 'DeleteItem', 'BatchWriteItem'].map((op) => `"Value":"${op}"`)
    )
  })
})

describe('DynamoStack user errors', () => {
  it('alarms once on the account-wide UserErrors metric, with no table dimension', () => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    const stack = new DynamoStack(parent, 'TestDynamo', { tableCapacityConfig: onDemand })
    const alarms = Object.values(Template.fromStack(stack).findResources('AWS::CloudWatch::Alarm')) as AlarmResource[]
    const userErrors = alarms.filter((a) => a.Properties.MetricName === 'UserErrors')
    expect(userErrors).toHaveLength(1)
    expect(userErrors[0].Properties.Dimensions ?? []).toHaveLength(0)
  })
})

describe('DynamoStack backups', () => {
  it('backs up all three tables, not just Orders and Nonces', () => {
    const app = new cdk.App()
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    const stack = new DynamoStack(parent, 'TestDynamo', { tableCapacityConfig: onDemand })
    const selections = Object.values(Template.fromStack(stack).findResources('AWS::Backup::BackupSelection'))
    expect(selections).toHaveLength(1)
    const resources = JSON.stringify(selections[0].Properties.BackupSelection.Resources)
    for (const table of ['NoncesTable', 'OrdersTable', 'LimitOrdersTable']) {
      expect(resources).toContain(table)
    }
    expect(selections[0].Properties.BackupSelection.Resources).toHaveLength(3)
  })
})
