import { OrdersQueryCache, QueryCache, queryCacheTtlFromEnv } from '../../repositories/QueryCache'

// Sub-second cache over the list-query path. Fillers poll the same query shapes
// continuously, so repeats inside this window are collapsed into a single read against
// the hot GSI partition.
//
// Opt-in, not a repository default: background jobs (the unimind cron, the reaper) write
// orders and immediately re-read them expecting fresh data. Only this read-only endpoint
// passes it in. Shared across the repositories this endpoint builds so they pool hits --
// the table name is part of every key, so Orders/LimitOrders/RelayOrders never collide.
export const getOrdersQueryCache: OrdersQueryCache = new QueryCache(queryCacheTtlFromEnv(), 'GetOrdersQueryCache')
