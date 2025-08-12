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
        { AttributeName: 'chainId', AttributeType: 'N' },
        { AttributeName: 'chainId_filler', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus', AttributeType: 'S' },
        { AttributeName: 'offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_offerer', AttributeType: 'S' },
        { AttributeName: 'filler_offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus_filler', AttributeType: 'S' },
        { AttributeName: 'pair', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offerer-createdAt-all',
          KeySchema: [
            { AttributeName: 'offerer', KeyType: 'HASH' },
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
          IndexName: 'offerer_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus', KeyType: 'HASH' },
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
          IndexName: 'filler_offerer-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_offerer', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_offerer_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_offerer_orderStatus', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'pair-createdAt-all',
          KeySchema: [
            { AttributeName: 'pair', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      TableName: `LimitOrders`,
      KeySchema: [{ AttributeName: 'orderHash', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'orderHash', AttributeType: 'S' },
        { AttributeName: 'offerer', AttributeType: 'S' },
        { AttributeName: 'filler', AttributeType: 'S' },
        { AttributeName: 'orderStatus', AttributeType: 'S' },
        { AttributeName: 'chainId', AttributeType: 'N' },
        { AttributeName: 'chainId_filler', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus', AttributeType: 'S' },
        { AttributeName: 'offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_orderStatus', AttributeType: 'S' },
        { AttributeName: 'filler_offerer', AttributeType: 'S' },
        { AttributeName: 'filler_offerer_orderStatus', AttributeType: 'S' },
        { AttributeName: 'chainId_orderStatus_filler', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'N' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'offerer-createdAt-all',
          KeySchema: [
            { AttributeName: 'offerer', KeyType: 'HASH' },
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
          IndexName: 'offerer_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'offerer_orderStatus', KeyType: 'HASH' },
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
          IndexName: 'filler_offerer-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_offerer', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        },
        {
          IndexName: 'filler_offerer_orderStatus-createdAt-all',
          KeySchema: [
            { AttributeName: 'filler_offerer_orderStatus', KeyType: 'HASH' },
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
      KeySchema: [{ AttributeName: 'offerer', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'offerer', AttributeType: 'S' }],
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      TableName: 'UnimindParameters',
      KeySchema: [{ AttributeName: 'pair', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'pair', AttributeType: 'S' }
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
    }
  ],
  port: 8000,
}
