module.exports = {
  tables: [
    {
      TableName: `Orders`,
      KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'orderHash', AttributeType: 'S' },
        { AttributeName: 'swapper', AttributeType: 'S' },
        { AttributeName: 'filler', AttributeType: 'S' },
        { AttributeName: 'orderStatus', AttributeType: 'S' },
        { AttributeName: 'chainId', AttributeType: 'N' },
        { AttributeName: 'chainId_filler', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus', AttributeType: 'S' },
        { AttributeName: 'swapper_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_swapper', AttributeType: 'S' },
        { AttributeName: 'filler_swapper_orderStatus', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus_filler', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'swapper-createdAt-all',
          KeySchema: [
            { AttributeName: 'swapper', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'chainId-createdAt-all',
          KeySchema: [
            { AttributeName: 'chainId', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'chainId_filler-createdAt-all',
          KeySchema: [
            { AttributeName: 'chainId_filler', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'chainId_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'chainId_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'chainId_orderStatus_filler-createdAt-all',
          KeySchema: [
            { AttributeName: 'chainId_orderStatus_filler', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'swapper_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'swapper_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_swapper-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_swapper', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_swapper_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_swapper_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      TableName: `Nonces`,
      KeySchema: [{ AttributeName: 'swapper', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'swapper', AttributeType: 'S' }],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
  ],
  port: 8000,
}
