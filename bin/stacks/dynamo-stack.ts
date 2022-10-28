import * as cdk from 'aws-cdk-lib'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { SERVICE_NAME } from '../constants'

export interface DynamoStackProps extends cdk.NestedStackProps {}

export class DynamoStack extends cdk.NestedStack {
  public readonly ordersTable: aws_dynamo.Table
  public readonly nonceTable: aws_dynamo.Table

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props)

    /* orders table */
    this.ordersTable = new aws_dynamo.Table(this, `${SERVICE_NAME}OrdersTable`, {
      tableName: 'Orders',
      partitionKey: {
        name: 'orderHash',
        type: aws_dynamo.AttributeType.STRING,
      },
      // in us-east-2, $1.25 per million WRU, $0.25 per million RRU
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'offererIndex',
      partitionKey: {
        name: 'offerer',
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: 'deadline',
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: ['orderHash', 'encodedOrder', 'signature'],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'sellTokenIndex',
      partitionKey: {
        name: 'sellToken',
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: 'deadline',
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: ['orderHash', 'encodedOrder', 'signature'],
    })

    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'orderStatusIndex',
      partitionKey: {
        name: 'orderStatus',
        type: aws_dynamo.AttributeType.STRING,
      },
      sortKey: {
        name: 'deadline',
        type: aws_dynamo.AttributeType.NUMBER,
      },
      projectionType: aws_dynamo.ProjectionType.INCLUDE,
      nonKeyAttributes: ['orderHash', 'encodedOrder', 'signature'],
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
      // in us-east-2, $1.25 per million WRU, $0.25 per million RRU
      billingMode: aws_dynamo.BillingMode.PAY_PER_REQUEST,
    })
  }
}
