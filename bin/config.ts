import { BillingMode } from 'aws-cdk-lib/aws-dynamodb'
import { TableCapacityConfig } from './stacks/dynamo-stack'

export const PROD_TABLE_CAPACITY: TableCapacityConfig = {
  order: { billingMode: BillingMode.PAY_PER_REQUEST },
  limitOrder: { billingMode: BillingMode.PAY_PER_REQUEST },
  nonce: { billingMode: BillingMode.PROVISIONED, readCapacity: 2000, writeCapacity: 1000 },
}
