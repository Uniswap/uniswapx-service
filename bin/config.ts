import { BillingMode } from 'aws-cdk-lib/aws-dynamodb'
import { IndexCapacityConfig, TableCapacityConfig } from './stacks/dynamo-stack'

export const PROD_INDEX_CAPACITY: IndexCapacityConfig = {
  orderStatus: { readCapacity: 20000, writeCapacity: 100 },
  fillerOrderStatus: { readCapacity: 2000, writeCapacity: 100 },
  filler: { readCapacity: 2000, writeCapacity: 100 },
  offerer: { readCapacity: 2000, writeCapacity: 100 },
  fillerOfferer: { readCapacity: 2000, writeCapacity: 100 },
  fillerOrderStatusOfferer: { readCapacity: 2000, writeCapacity: 1000 },
  offererOrderStatus: { readCapacity: 2000, writeCapacity: 1000 },
  chainId: { readCapacity: 20000, writeCapacity: 1000 },
  chainIdFiller: { readCapacity: 2000, writeCapacity: 1000 },
  chaindIdOrderStatus: { readCapacity: 2000, writeCapacity: 100 },
  chainIdFillerOrderStatus: { readCapacity: 2000, writeCapacity: 100 },
}

export const PROD_TABLE_CAPACITY: TableCapacityConfig = {
  order: { billingMode: BillingMode.PROVISIONED, readCapacity: 2000, writeCapacity: 100 },
  nonce: { billingMode: BillingMode.PROVISIONED, readCapacity: 2000, writeCapacity: 1000 },
}
