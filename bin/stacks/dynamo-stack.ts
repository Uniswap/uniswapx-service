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
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })

    // Create global secondary indexes with createdAt sort key

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.CREATED_AT,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [TABLE_KEY.ORDER_HASH, TABLE_KEY.ENCODED_ORDER, TABLE_KEY.SIGNATURE, TABLE_KEY.ORDER_STATUS],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.SELL_TOKEN,
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
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.ORDER_STATUS,
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
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN,
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
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_ORDER_STATUS,
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
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_SELL_TOKEN,
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
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`,
      partitionKey: {
        name: TABLE_KEY.SELL_TOKEN_ORDER_STATUS,
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
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.CREATED_AT}-index`,
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
      ],
    })

    // Create global secondary indexes with deadline sort key

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.SELL_TOKEN,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.OFFERER_SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.OFFERER_SELL_TOKEN,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.SELL_TOKEN_ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
        TABLE_KEY.CREATED_AT,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: `${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.DEADLINE}-index`,
      partitionKey: {
        name: TABLE_KEY.CREATED_AT_MONTH,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      sortKey: {
        name: TABLE_KEY.DEADLINE,
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_KEY.ORDER_HASH,
        TABLE_KEY.ENCODED_ORDER,
        TABLE_KEY.SIGNATURE,
        TABLE_KEY.ORDER_STATUS,
        TABLE_KEY.OFFERER,
      ],
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
