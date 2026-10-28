import { OrdersQueryCache, QueryCache, queryCacheTtlFromEnv } from '../../repositories/QueryCache'

// GET /limit-orders is polled by fillers the same way GET /orders is, against the same
// kind of hot single-status GSI partition on the LimitOrders table. Its own instance
// (rather than sharing get-orders') keeps hit/miss metrics attributable per endpoint.
export const getLimitOrdersQueryCache: OrdersQueryCache = new QueryCache(
  queryCacheTtlFromEnv(),
  'GetLimitOrdersQueryCache'
)
