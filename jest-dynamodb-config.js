module.exports = {
  tables: [
    {
      TableName: `Orders`,
      KeySchema: [{AttributeName: 'orderHash', KeyType: 'HASH'}],
      AttributeDefinitions: [{AttributeName: 'orderHash', AttributeType: 'S'}],
      ProvisionedThroughput: {ReadCapacityUnits: 5, WriteCapacityUnits: 5},
    },
  ],
  port: 8000,
};