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
        { AttributeName: 'offererOrderStatusSellToken', AttributeType: 'S' },
        { AttributeName: 'deadline', AttributeType: 'N' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offerer-createdAt-index',
          KeySchema: [
            { AttributeName: 'offerer', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'orderStatus', 'encodedOrder', 'nonce', 'orderHash', 'sellToken'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'orderStatus-createdAt-index',
          KeySchema: [
            { AttributeName: 'orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'sellToken'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'sellToken-createdAt-index',
          KeySchema: [
            { AttributeName: 'sellToken', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'orderStatus'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'offererOrderStatusSellToken-createdAt-index',
          KeySchema: [
            { AttributeName: 'offererOrderStatusSellToken', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
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
          IndexName: 'offererOrderStatus-createdAt-index',
          KeySchema: [
            { AttributeName: 'offererOrderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
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
          IndexName: 'offererSellToken-createdAt-index',
          KeySchema: [
            { AttributeName: 'offererSellToken', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
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
          IndexName: 'sellTokenOrderStatus-createdAt-index',
          KeySchema: [
            { AttributeName: 'sellTokenOrderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
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
          IndexName: 'offerer-deadline-index',
          KeySchema: [
            { AttributeName: 'offerer', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'orderStatus', 'encodedOrder', 'nonce', 'orderHash', 'sellToken'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'orderStatus-deadline-index',
          KeySchema: [
            { AttributeName: 'orderStatus', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'sellToken', 'createdAt'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'sellToken-deadline-index',
          KeySchema: [
            { AttributeName: 'sellToken', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['signature', 'offerer', 'encodedOrder', 'nonce', 'orderHash', 'orderStatus'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'offererOrderStatusSellToken-deadline-index',
          KeySchema: [
            { AttributeName: 'offererOrderStatusSellToken', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
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
          IndexName: 'offererOrderStatus-deadline-index',
          KeySchema: [
            { AttributeName: 'offererOrderStatus', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
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
          IndexName: 'offererSellToken-deadline-index',
          KeySchema: [
            { AttributeName: 'offererSellToken', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
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
          IndexName: 'sellTokenOrderStatus-deadline-index',
          KeySchema: [
            { AttributeName: 'sellTokenOrderStatus', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
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
