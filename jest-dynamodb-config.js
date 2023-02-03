module.exports = {
  tables: [
    {
      TableName: `Orders`,
      KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'orderHash', AttributeType: 'S' },
        { AttributeName: 'offerer', AttributeType: 'S' },
        { AttributeName: 'filler', AttributeType: 'S' },
        { AttributeName: 'orderStatus', AttributeType: 'S' },
        { AttributeName: 'offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_offerer', AttributeType: 'S' },
        { AttributeName: 'filler_offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offerer-createdAt',
          KeySchema: [
            { AttributeName: 'offerer', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'orderStatus', 'encodedOrder', 'nonce', 'orderHash', 'filler'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'filler'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler-createdAt',
          KeySchema: [
            { AttributeName: 'filler', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'orderStatus', 'encodedOrder', 'nonce', 'orderHash', 'offerer'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'offerer_orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'encodedOrder', 'nonce', 'orderHash', 'offerer', 'orderStatus', 'filler'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'filler_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'encodedOrder', 'nonce', 'orderHash', 'offerer', 'orderStatus', 'filler'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_offerer-createdAt',
          KeySchema: [
            { AttributeName: 'filler_offerer', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'encodedOrder', 'nonce', 'orderHash', 'offerer', 'orderStatus', 'filler'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_offerer_orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'filler_offerer_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'encodedOrder', 'nonce', 'orderHash', 'offerer', 'orderStatus', 'filler'],
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
