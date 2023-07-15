import * as cdk from 'aws-cdk-lib'
import * as aws_backup from 'aws-cdk-lib/aws-backup'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'

import { Operation } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { TABLE_KEY } from '../../lib/config/dynamodb'
import { SERVICE_NAME } from '../constants'

export type TableCapacityOptions = {
  billingMode: aws_dynamo.BillingMode
  readCapacity?: number
  writeCapacity?: number
}

export type DynamoStackProps = {
  chatbotSNSArn?: string
  tableCapacityOptions: TableCapacityOptions
} & cdk.NestedStackProps

export class DynamoStack extends cdk.NestedStack {
  public readonly ordersTable: aws_dynamo.Table
  public readonly nonceTable: aws_dynamo.Table

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props)

    const { chatbotSNSArn, tableCapacityOptions } = props

    /* orders table */
    const ordersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}OrdersTable`, {
      tableName: 'Orders',
      partitionKey: {
        name: TABLE_KEY.ORDER_HASH,
        type: aws_dynamo.AttributeType.STRING,
      },
      stream: aws_dynamo.StreamViewType.NEW_IMAGE,
      deletionProtection: true,
      pointInTimeRecovery: true,
      ...tableCapacityOptions,
    })
    this.ordersTable = ordersTable

    // Create global secondary indexes with createdAt sort key
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: TABLE_KEY.OFFERER,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: TABLE_KEY.ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: TABLE_KEY.FILLER,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CHAIN_ID}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: TABLE_KEY.CHAIN_ID,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
      ...(tableCapacityOptions.readCapacity && { readCapacity: tableCapacityOptions.readCapacity }),
      ...(tableCapacityOptions.writeCapacity && { writeCapacity: tableCapacityOptions.writeCapacity }),
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey: {
        name: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.ALL,
    })

    this.ordersTable = ordersTable

    /* Nonces Table
     * This is needed because we want to do strongly-consistent reads on the nonce value,
     *  which is not possible to do on secondary indexes (if we work with only the Orders table).
     */
    const nonceTable = new aws_dynamo.Table(this, `${SERVICE_NAME}NoncesTable`, {
      tableName: 'Nonces',
      partitionKey: {
        name: 'offerer',
        type: aws_dynamo.AttributeType.STRING,
      },
      deletionProtection: true,
      pointInTimeRecovery: true,
    })
    this.nonceTable = nonceTable

    this.alarmsPerTable(this.nonceTable, 'Nonces', chatbotSNSArn)
    this.alarmsPerTable(this.ordersTable, 'Orders', chatbotSNSArn)

    // Dynamos built-in PointInTimeRecovery retention is max 35 days.
    // In addition to PITR being enabled on the tables we do a monthly backup
    // in case we need to recover to a point older than 35 months.
    const plan = aws_backup.BackupPlan.dailyWeeklyMonthly5YearRetention(this, 'DDBBackupPlan')
    plan.addRule(aws_backup.BackupPlanRule.monthly1Year())
    plan.addSelection('DDBBackupSelection', {
      resources: [
        aws_backup.BackupResource.fromDynamoDbTable(nonceTable),
        aws_backup.BackupResource.fromDynamoDbTable(ordersTable),
      ],
    })
  }

  private alarmsPerTable(table: aws_dynamo.Table, name: string, chatbotSNSArn?: string): void {
    const readCapacityAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-ReadCapacityAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-ReadCapacityAlarm`,
      metric: table.metricConsumedReadCapacityUnits(),
      threshold: 80,
      evaluationPeriods: 2,
    })

    const writeCapacityAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-WriteCapacityAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-WriteCapacityAlarm`,
      metric: table.metricConsumedWriteCapacityUnits(),
      threshold: 80,
      evaluationPeriods: 2,
    })

    const readThrottleAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-ReadThrottlesAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-ReadThrottlesAlarm`,
      metric: table.metricThrottledRequestsForOperations({
        operations: [
          Operation.GET_ITEM,
          Operation.BATCH_GET_ITEM,
          Operation.BATCH_WRITE_ITEM,
          Operation.PUT_ITEM,
          Operation.QUERY,
          Operation.SCAN,
          Operation.UPDATE_ITEM,
          Operation.DELETE_ITEM,
        ],
      }),
      threshold: 10,
      evaluationPeriods: 2,
    })

    const writeThrottleAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-WriteThrottlesAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-WriteThrottlesAlarm`,
      metric: table.metricThrottledRequestsForOperations({
        operations: [
          Operation.GET_ITEM,
          Operation.BATCH_GET_ITEM,
          Operation.BATCH_WRITE_ITEM,
          Operation.PUT_ITEM,
          Operation.QUERY,
          Operation.SCAN,
          Operation.UPDATE_ITEM,
          Operation.DELETE_ITEM,
        ],
      }),
      threshold: 10,
      evaluationPeriods: 2,
    })

    const systemErrorsAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-SystemErrorsAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-SystemErrorsAlarm`,
      metric: table.metricSystemErrorsForOperations({
        operations: [
          Operation.GET_ITEM,
          Operation.BATCH_GET_ITEM,
          Operation.BATCH_WRITE_ITEM,
          Operation.PUT_ITEM,
          Operation.QUERY,
          Operation.SCAN,
          Operation.UPDATE_ITEM,
          Operation.DELETE_ITEM,
        ],
      }),
      threshold: 10,
      evaluationPeriods: 2,
    })

    const userErrorsAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-UserErrorsAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-UserErrorsAlarm`,
      metric: table.metricUserErrors(),
      threshold: 10,
      evaluationPeriods: 2,
    })

    if (chatbotSNSArn) {
      const chatBotTopic = cdk.aws_sns.Topic.fromTopicArn(this, 'ChatbotTopic', chatbotSNSArn)
      userErrorsAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      systemErrorsAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      writeThrottleAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      readThrottleAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      writeCapacityAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      readCapacityAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
    }
  }
}
