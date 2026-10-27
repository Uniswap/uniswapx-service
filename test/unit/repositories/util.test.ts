import { getTableIndices } from '../../../lib/repositories/util'

describe('getTableIndices', () => {
  it('maps every GSI to its partition and sort key, as the hand-written map did', () => {
    // Pinned to the literal map from before the GSI list was shared with CDK; dynamodb-toolbox
    // routes queries by these names, so any change here must match a deployed index.
    expect(getTableIndices()).toEqual({
      'offerer-createdAt-all': { partitionKey: 'offerer', sortKey: 'createdAt' },
      'orderStatus-createdAt-all': { partitionKey: 'orderStatus', sortKey: 'createdAt' },
      'filler-createdAt-all': { partitionKey: 'filler', sortKey: 'createdAt' },
      'chainId-createdAt-all': { partitionKey: 'chainId', sortKey: 'createdAt' },
      'filler_orderStatus-createdAt-all': { partitionKey: 'filler_orderStatus', sortKey: 'createdAt' },
      'filler_offerer-createdAt-all': { partitionKey: 'filler_offerer', sortKey: 'createdAt' },
      'filler_offerer_orderStatus-createdAt-all': { partitionKey: 'filler_offerer_orderStatus', sortKey: 'createdAt' },
      'offerer_orderStatus-createdAt-all': { partitionKey: 'offerer_orderStatus', sortKey: 'createdAt' },
      'chainId_filler-createdAt-all': { partitionKey: 'chainId_filler', sortKey: 'createdAt' },
      'chainId_orderStatus-createdAt-all': { partitionKey: 'chainId_orderStatus', sortKey: 'createdAt' },
      'chainId_orderStatus_filler-createdAt-all': { partitionKey: 'chainId_orderStatus_filler', sortKey: 'createdAt' },
      'pair-createdAt-all': { partitionKey: 'pair', sortKey: 'createdAt' },
    })
  })
})
