import { Logger } from '@aws-lambda-powertools/logger'
import { StatusUpdateFill } from '../core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { log } from '../Logging'

export const MODEL_NAME = {
  DUTCH: 'Order',
  LIMIT: 'LimitOrder',
}

export type QueryResult<T extends UniswapXOrderEntity> = {
  orders: T[]
  cursor?: string
}

/** What a store needs from the caller's context: an API request's own, or an adapter elsewhere. */
export type OrderStoreContext = { logger: Pick<Logger, 'warn' | 'error'> }

// For callers with no request context (the tracker, the GS reaper): the store logs where it always did.
export const SERVICE_STORE_CONTEXT: OrderStoreContext = { logger: log }

/**
 * Reads and status writes on one order table, with the names of the backend's OrderStore
 * (packages/services/uniswapx/src/core/orders/OrderStore.ts) that ports them.
 */
export interface OrderStore<T extends UniswapXOrderEntity> {
  getByHash: (ctx: OrderStoreContext, hash: string) => Promise<T | undefined>
  updateOrderStatus: (
    ctx: OrderStoreContext,
    orderHash: string,
    status: ORDER_STATUS,
    fill?: StatusUpdateFill
  ) => Promise<void>
}

// What only the post path uses.
export interface PostOrderStore<T extends UniswapXOrderEntity> {
  // createdAt is epoch seconds.
  putOrderAndUpdateNonce: (ctx: OrderStoreContext, order: T, createdAt: number) => Promise<void>
  // The offerer's OPEN orders, counted up to max + 1.
  countOpenOrders: (ctx: OrderStoreContext, offerer: string, max: number) => Promise<number>
  getNonce: (ctx: OrderStoreContext, address: string, chainId: number) => Promise<string | undefined>
}

export interface BaseOrdersRepository<T extends UniswapXOrderEntity> extends OrderStore<T>, PostOrderStore<T> {
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams, cursor?: string) => Promise<QueryResult<T>>
  getOrdersFilteredByType: (
    limit: number,
    queryFilters: GetOrdersQueryParams,
    types: string[],
    cursor?: string
  ) => Promise<QueryResult<T>>
}
