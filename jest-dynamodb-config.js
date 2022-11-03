module.exports = {
  tables: [
    {
      TableName: `Orders`,
      KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'orderHash', AttributeType: 'S' },
        { AttributeName: 'offerer', AttributeType: 'S' },
        { AttributeName: 'orderStatus', AttributeType: 'S' },
        { AttributeName: 'sellToken', AttributeType: 'S' },
        { AttributeName: 'offererOrderStatus', AttributeType: 'S' },
        { AttributeName: 'offererSellToken', AttributeType: 'S' },
        { AttributeName: 'sellTokenOrderStatus', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offererIndex',
          KeySchema: [{ AttributeName: 'offerer', KeyType: 'HASH' }],
          Projection: {
            NonKeyAttributes: ['signature', 'orderStatus', 'encodedOrder', 'nonce', 'orderHash', 'sellToken'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'orderStatusIndex',
          KeySchema: [{ AttributeName: 'orderStatus', KeyType: 'HASH' }],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'sellToken'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'sellTokenIndex',
          KeySchema: [{ AttributeName: 'sellToken', KeyType: 'HASH' }],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'orderStatus'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'offererOrderStatusIndex',
          KeySchema: [
            { AttributeName: 'offererOrderStatus', KeyType: 'HASH' },
            { AttributeName: 'sellToken', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: [
              'signature',
              'encodedOrder',
              'nonce',
              'orderHash',
              'offerer',
              'orderStatus',
              'sellToken',
            ],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'offererSellTokenIndex',
          KeySchema: [{ AttributeName: 'offererSellToken', KeyType: 'HASH' }],
          Projection: {
            NonKeyAttributes: [
              'signature',
              'encodedOrder',
              'nonce',
              'orderHash',
              'offerer',
              'orderStatus',
              'sellToken',
            ],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'sellTokenOrderStatusIndex',
          KeySchema: [{ AttributeName: 'sellTokenOrderStatus', KeyType: 'HASH' }],
          Projection: {
            NonKeyAttributes: [
              'signature',
              'encodedOrder',
              'nonce',
              'orderHash',
              'offerer',
              'orderStatus',
              'sellToken',
            ],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      TableName: `Nonces`,
      KeySchema: [{ AttributeName: 'offerer', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'offerer', AttributeType: 'S' }],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
  ],
  port: 8000,
}
