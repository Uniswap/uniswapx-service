import * as cdk from 'aws-cdk-lib'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { TABLE_KEY } from '../../lib/config/dynamodb'
import { SERVICE_NAME } from '../constants'

export type DynamoStackProps = cdk.NestedStackProps

export class DynamoStack extends cdk.NestedStack {
  public readonly ordersTable: aws_dynamo.Table
  public readonly nonceTable: aws_dynamo.Table

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props)

    /* orders table */
    this.ordersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}OrdersTable`, {
      tableName: 'Orders',
      partitionKey: {
        name: TABLE_KEY.ORDER_HASH,
        type: aws_dynamo.AttributeType.STRING,
      },
      stream: aws_dynamo.StreamViewType.NEW_IMAGE,
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })

    // Create global secondary indexes with createdAt sort key

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.FILLER,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.FILLER,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`,
      partitionKey: {
        name: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.FILLER,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`,
      partitionKey: {
        name: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.FILLER,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.CREATED_AT}`,
      partitionKey: {
        name: TABLE_KEY.CREATED_AT_MONTH,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.FILLER,
      ],
    })

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

    /* Nonces Table
     * This is needed because we want to do strongly-consistent reads on the nonce value,
     *  which is not possible to do on secondary indexes (if we work with only the Orders table).
     */
    this.nonceTable = new aws_dynamo.Table(this, `${SERVICE_NAME}NoncesTable`, {
      tableName: 'Nonces',
      partitionKey: {
        name: 'offerer',
        type: aws_dynamo.AttributeType.STRING,
      },
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })
  }
}
