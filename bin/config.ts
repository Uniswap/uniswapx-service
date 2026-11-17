import { BillingMode } from 'aws-cdk-lib/aws-dynamodb'
import { TableCapacityConfig } from './stacks/dynamo-stack'

export const PROD_TABLE_CAPACITY: TableCapacityConfig = {
  order: { billingMode: BillingMode.PAY_PER_REQUEST },
  limitOrder: { billingMode: BillingMode.PAY_PER_REQUEST },
  // Was provisioned at 2,000 reads and 1,000 writes a second since 2023. Measured in the two weeks
  // to Nov 17, 2026: reads peaked at about 150 a second and writes stayed under 1, so the table
  // paid for roughly 13x the reads and 1,000x the writes it used. On demand it costs what it serves.
  nonce: { billingMode: BillingMode.PAY_PER_REQUEST },
}
