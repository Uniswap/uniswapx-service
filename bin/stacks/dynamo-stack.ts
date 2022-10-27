import * as cdk from 'aws-cdk-lib'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { TABLE_KEY } from '../../lib/util/db'
import { SERVICE_NAME } from '../constants'

export interface DynamoStackProps extends cdk.NestedStackProps {}

export class DynamoStack extends cdk.NestedStack {
  public readonly ordersTable: aws_dynamo.Table

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props)

    /* orders table */
    this.ordersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}OrdersTable`, {
      tableName: 'Orders',
      partitionKey: {
        name: TABLE_KEY.ORDER_HASH,
        type: aws_dynamo.AttributeType.STRING,
      },
      // in us-east-2, $1.25 per million WRU, $0.25 per million RRU
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'offererIndex',
      partitionKey: {
        name: TABLE_KEY.OFFERER,
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
        TABLE_KEY.SELL_TOKEN,
        TABLE_KEY.ORDER_STATUS,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'sellTokenIndex',
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
        TABLE_KEY.OFFERER,
        TABLE_KEY.ORDER_STATUS,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'orderStatusIndex',
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
        TABLE_KEY.SELL_TOKEN,
      ],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'offerer-orderStatus-index',
      partitionKey: {
        name: TABLE_KEY.OFFERER_ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_KEY.SELL_TOKEN,
        type: aws_dynamo.AttributeType.STRING,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: [TABLE_KEY.ORDER_HASH, TABLE_KEY.ENCODED_ORDER, TABLE_KEY.SIGNATURE, TABLE_KEY.CREATED_AT],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'offerer-sellToken-index',
      partitionKey: {
        name: TABLE_KEY.OFFERER_SELL_TOKEN,
        type: aws_dynamo.AttributeType.STRING,
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
      indexName: 'sellToken-orderStatus-index',
      partitionKey: {
        name: TABLE_KEY.SELL_TOKEN_ORDER_STATUS,
        type: aws_dynamo.AttributeType.STRING,
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
  }
}
