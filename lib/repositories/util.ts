import { GLOBAL_SECONDARY_INDEXES } from '../config/dynamodb'

export enum TABLE_NAMES {
  LimitOrders = 'LimitOrders',
  Orders = 'Orders',
  Nonces = 'Nonces',
}

export const getTableIndices = () =>
  Object.fromEntries(
    GLOBAL_SECONDARY_INDEXES.map(({ indexName, partitionKey, sortKey }) => [indexName, { partitionKey, sortKey }])
  )
