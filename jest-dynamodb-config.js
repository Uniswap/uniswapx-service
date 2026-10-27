// Plain node, so the GSIs come from the JSON list CDK and the repositories also read
// (lib/config/dynamodb.ts derives the same `${partitionKey}-createdAt-all` names).
const GSI_PARTITION_KEYS = require('./lib/config/global-secondary-indexes.json')

const THROUGHPUT = { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }

const ordersTable = (TableName) => ({
  TableName,
  KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
  AttributeDefinitions: [
    { AttributeName: 'orderHash', AttributeType: 'S' },
    ...GSI_PARTITION_KEYS.map(({ partitionKey, partitionKeyType }) => ({
      AttributeName: partitionKey,
      AttributeType: partitionKeyType,
    })),
    { AttributeName: 'createdAt', AttributeType: 'N' },
  ],
  GlobalSecondaryIndexes: GSI_PARTITION_KEYS.map(({ partitionKey }) => ({
    IndexName: `${partitionKey}-createdAt-all`,
    KeySchema: [
      { AttributeName: partitionKey, KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
    Projection: { ProjectionType: 'ALL' },
    ProvisionedThroughput: THROUGHPUT,
  })),
  ProvisionedThroughput: THROUGHPUT,
})

module.exports = {
  tables: [
    ordersTable('Orders'),
    ordersTable('LimitOrders'),
    {
      TableName: `Nonces`,
      KeySchema: [{ AttributeName: 'offerer', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'offerer', AttributeType: 'S' }],
      ProvisionedThroughput: THROUGHPUT,
    },
  ],
  port: 8000,
}
