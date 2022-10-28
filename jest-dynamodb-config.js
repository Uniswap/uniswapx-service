module.exports = {
  tables: [
    {
      TableName: `Orders`,
      KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'orderHash', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      TableName: `Nonces`,
      KeySchema: [{ AttributeName: 'offerer', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'offerer', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    }
  ],
  port: 8000,
}
