import * as cdk from 'aws-cdk-lib'
import * as aws_backup from 'aws-cdk-lib/aws-backup'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'

import { Operation } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { TABLE_KEY } from '../../lib/config/dynamodb'
import { SERVICE_NAME } from '../constants'
import { AlarmNotifier } from './alerting'

type CapacityOptions = {
  readCapacity?: number
  writeCapacity?: number
}

type TableCapacityOptions = {
  billingMode: aws_dynamo.BillingMode
} & CapacityOptions

export type IndexCapacityConfig = {
  orderStatus?: CapacityOptions
  offerer?: CapacityOptions
  filler?: CapacityOptions
  fillerOrderStatus?: CapacityOptions
  fillerOfferer?: CapacityOptions
  fillerOrderStatusOfferer?: CapacityOptions
  offererOrderStatus?: CapacityOptions
  chainId?: CapacityOptions
  chainIdFiller?: CapacityOptions
  chaindIdOrderStatus?: CapacityOptions
  chainIdFillerOrderStatus?: CapacityOptions
  pair?: CapacityOptions
}

export type TableCapacityConfig = {
  order: TableCapacityOptions
  limitOrder: TableCapacityOptions
  nonce: TableCapacityOptions
  quoteMetadata: TableCapacityOptions
  unimindParameters: TableCapacityOptions
}

export type DynamoStackProps = {
  chatbotSNSArn?: string
  incidentIoSNSArn?: string
  tableCapacityConfig: TableCapacityConfig
  indexCapacityConfig?: IndexCapacityConfig
} & cdk.NestedStackProps

export class DynamoStack extends cdk.NestedStack {
  public readonly ordersTable: aws_dynamo.Table
  public readonly nonceTable: aws_dynamo.Table
  public readonly limitOrdersTable: aws_dynamo.Table
  public readonly quoteMetadataTable: aws_dynamo.Table
  public readonly unimindParametersTable: aws_dynamo.Table

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props)

    const { chatbotSNSArn, incidentIoSNSArn, tableCapacityConfig, indexCapacityConfig } = props
    const notifier = new AlarmNotifier(this, { chatbotSNSArn, incidentIoSNSArn })

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
      contributorInsightsEnabled: false,
      ...tableCapacityConfig.order,
    })
    createCommonIndices(ordersTable, indexCapacityConfig)
    this.ordersTable = ordersTable

    const limitOrdersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}LimitOrdersTable`, {
      tableName: 'LimitOrders',
      partitionKey: {
        name: TABLE_KEY.ORDER_HASH,
        type: aws_dynamo.AttributeType.STRING,
      },
      stream: aws_dynamo.StreamViewType.NEW_IMAGE,
      deletionProtection: true,
      pointInTimeRecovery: true,
      contributorInsightsEnabled: false,
      ...tableCapacityConfig.limitOrder,
    })
    createCommonIndices(limitOrdersTable, indexCapacityConfig)
    this.limitOrdersTable = limitOrdersTable

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
      contributorInsightsEnabled: false,
      ...tableCapacityConfig.nonce,
    })
    this.nonceTable = nonceTable

    this.alarmsPerTable(this.nonceTable, 'Nonces', tableCapacityConfig.nonce, notifier)
    this.alarmsPerTable(this.ordersTable, 'Orders', tableCapacityConfig.order, notifier)
    this.hotIndexAlarms(this.ordersTable, 'Orders', notifier)

    const quoteMetadataTable = new aws_dynamo.Table(this, `${SERVICE_NAME}QuoteMetadataTable`, {
      tableName: 'QuoteMetadata',
      partitionKey: {
        name: 'quoteId',
        type: aws_dynamo.AttributeType.STRING,
      },
      deletionProtection: true,
      pointInTimeRecovery: true,
      contributorInsightsEnabled: false,
      ...tableCapacityConfig.quoteMetadata,
    })
    this.quoteMetadataTable = quoteMetadataTable

    this.alarmsPerTable(this.quoteMetadataTable, 'QuoteMetadata', tableCapacityConfig.quoteMetadata, notifier)

    const unimindParametersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}UnimindParametersTable`, {
      tableName: 'UnimindParameters',
      partitionKey: {
        name: 'pair',
        type: aws_dynamo.AttributeType.STRING,
      },
      deletionProtection: true,
      pointInTimeRecovery: true,
      contributorInsightsEnabled: false,
      ...tableCapacityConfig.unimindParameters,
    })
    this.unimindParametersTable = unimindParametersTable

    this.alarmsPerTable(
      this.unimindParametersTable,
      'UnimindParameters',
      tableCapacityConfig.unimindParameters,
      notifier
    )

    // Dynamos built-in PointInTimeRecovery retention is max 35 days.
    // In addition to PITR being enabled on the tables we do a monthly backup
    // in case we need to recover to a point older than 35 months.
    const plan = aws_backup.BackupPlan.dailyWeeklyMonthly5YearRetention(this, 'DDBBackupPlan')
    plan.addRule(aws_backup.BackupPlanRule.monthly1Year())
    plan.addSelection('DDBBackupSelection', {
      resources: [
        aws_backup.BackupResource.fromDynamoDbTable(nonceTable),
        aws_backup.BackupResource.fromDynamoDbTable(ordersTable),
        aws_backup.BackupResource.fromDynamoDbTable(unimindParametersTable),
      ],
    })
  }

  private alarmsPerTable(
    table: aws_dynamo.Table,
    name: string,
    capacity: TableCapacityOptions,
    notifier: AlarmNotifier
  ): void {
    // Consumed-capacity alarms only mean something against a provisioned ceiling. On a
    // pay-per-request table there is no ceiling and the old "80 units per 5 minutes" was always
    // exceeded, so the Orders alarms sat in ALARM permanently. On a provisioned table the same
    // 80-unit threshold was just as permanently exceeded (Nonces alarmed from June on), so the
    // threshold is now 80% of the provisioned capacity summed over the 5-minute period.
    if (capacity.billingMode !== aws_dynamo.BillingMode.PAY_PER_REQUEST) {
      const period = cdk.Duration.minutes(5)
      const eightyPercentOver = (unitsPerSecond: number) => 0.8 * unitsPerSecond * period.toSeconds()
      notifier.wire(
        new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-ReadCapacityAlarm`, {
          alarmName: `${SERVICE_NAME}-SEV3-${name}-ReadCapacityAlarm`,
          metric: table.metricConsumedReadCapacityUnits({ period, statistic: 'Sum' }),
          threshold: eightyPercentOver(capacity.readCapacity ?? 5),
          evaluationPeriods: 2,
        }),
        new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-WriteCapacityAlarm`, {
          alarmName: `${SERVICE_NAME}-SEV3-${name}-WriteCapacityAlarm`,
          metric: table.metricConsumedWriteCapacityUnits({ period, statistic: 'Sum' }),
          threshold: eightyPercentOver(capacity.writeCapacity ?? 5),
          evaluationPeriods: 2,
        })
      )
    }

    // DynamoDB only publishes ThrottledRequests / SystemErrors when they are non-zero, so a
    // quiet table produces no datapoints. The default (treat missing as missing) freezes the
    // alarm in whatever state it last had, which left the Orders throttle alarms stuck in
    // ALARM for weeks. Missing must mean healthy.
    const quietIsHealthy = { treatMissingData: aws_cloudwatch.TreatMissingData.NOT_BREACHING }

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
      ...quietIsHealthy,
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
      ...quietIsHealthy,
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
      ...quietIsHealthy,
    })

    const userErrorsAlarm = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-${name}-UserErrorsAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-${name}-UserErrorsAlarm`,
      metric: table.metricUserErrors(),
      threshold: 10,
      evaluationPeriods: 2,
      ...quietIsHealthy,
    })

    notifier.wire(userErrorsAlarm, systemErrorsAlarm, writeThrottleAlarm, readThrottleAlarm)
  }

  /**
   * Read throttles on the GSIs the Get Orders cache serves. The table-level ThrottledRequests
   * alarms above did not move on Sep 2 while these indexes were rejecting over a million reads
   * every five minutes: a single hot partition key throttles at the index, and that is where the
   * signal is. Zero in steady state, so any sustained count is an incident.
   */
  private hotIndexAlarms(table: aws_dynamo.Table, name: string, notifier: AlarmNotifier): void {
    const hotIndexes = [
      `${TABLE_KEY.CHAIN_ID_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      `${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`,
      `${TABLE_KEY.CHAIN_ID}-${TABLE_KEY.CREATED_AT}-all`,
    ]
    for (const index of hotIndexes) {
      notifier.wire(
        new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV2-${name}-${index}-ReadThrottles`, {
          alarmName: `${SERVICE_NAME}-SEV2-${name}-GSI-${index}-ReadThrottles`,
          metric: new aws_cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: table.tableName, GlobalSecondaryIndexName: index },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 1000,
          evaluationPeriods: 2,
          datapointsToAlarm: 2,
          comparisonOperator: aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: aws_cloudwatch.TreatMissingData.NOT_BREACHING,
        })
      )
    }
  }
}

const createCommonIndices = (table: aws_dynamo.Table, indexCapacityConfig: IndexCapacityConfig | undefined) => {
  // Create global secondary indexes with createdAt sort key
  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.offerer,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.orderStatus,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.filler,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.fillerOrderStatus,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.fillerOfferer,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.fillerOrderStatusOfferer,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.offererOrderStatus,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.chainId,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.chainIdFiller,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.chaindIdOrderStatus,
  })

  table.addGlobalSecondaryIndex({
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
    ...indexCapacityConfig?.chainIdFillerOrderStatus,
  })

  table.addGlobalSecondaryIndex({
    indexName: `${TABLE_KEY.PAIR}-${TABLE_KEY.CREATED_AT}-all`,
    partitionKey: {
      name: TABLE_KEY.PAIR,
      type: aws_dynamo.AttributeType.STRING,
    },
    sortKey: {
      name: TABLE_KEY.CREATED_AT,
      type: aws_dynamo.AttributeType.NUMBER,
    },
    projectionType: aws_dynamo.ProjectionType.ALL,
    ...indexCapacityConfig?.pair,
  })
}
