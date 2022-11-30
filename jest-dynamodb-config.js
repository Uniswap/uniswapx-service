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
        { AttributeName: 'offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'offerer_sellToken', AttributeType: 'S' },
        { AttributeName: 'sellToken_orderStatus', AttributeType: 'S' },
        { AttributeName: 'offerer_orderStatus_sellToken', AttributeType: 'S' },
        { AttributeName: 'deadline', AttributeType: 'N' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
        { AttributeName: 'createdAtMonth', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offerer-createdAt',
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
          IndexName: 'orderStatus-createdAt',
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
          IndexName: 'sellToken-createdAt',
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
          IndexName: 'offerer_orderStatus_sellToken-createdAt',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus_sellToken', KeyType: 'HASH' },
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
          IndexName: 'offerer_orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus', KeyType: 'HASH' },
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
          IndexName: 'offerer_sellToken-createdAt',
          KeySchema: [
            { AttributeName: 'offerer_sellToken', KeyType: 'HASH' },
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
          IndexName: 'sellToken_orderStatus-createdAt',
          KeySchema: [
            { AttributeName: 'sellToken_orderStatus', KeyType: 'HASH' },
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
          IndexName: 'createdAtMonth-createdAt',
          KeySchema: [
            { AttributeName: 'createdAtMonth', KeyType: 'HASH' },
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
          IndexName: 'offerer-deadline',
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
          IndexName: 'orderStatus-deadline',
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
          IndexName: 'sellToken-deadline',
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
          IndexName: 'offerer_orderStatus_sellToken-deadline',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus_sellToken', KeyType: 'HASH' },
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
          IndexName: 'offerer_orderStatus-deadline',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus', KeyType: 'HASH' },
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
          IndexName: 'offerer_sellToken-deadline',
          KeySchema: [
            { AttributeName: 'offerer_sellToken', KeyType: 'HASH' },
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
          IndexName: 'sellToken_orderStatus-deadline',
          KeySchema: [
            { AttributeName: 'sellToken_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['orderHash'],
            ProjectionType: 'INCLUDE',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'createdAtMonth-deadline',
          KeySchema: [
            { AttributeName: 'createdAtMonth', KeyType: 'HASH' },
            { AttributeName: 'deadline', KeyType: 'RANGE' },
          ],
          Projection: {
            NonKeyAttributes: ['orderHash'],
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
