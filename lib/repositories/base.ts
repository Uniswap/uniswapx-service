import { StatusUpdateFill } from '../core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export const MODEL_NAME = {
  DUTCH: 'Order',
  LIMIT: 'LimitOrder',
}

export type QueryResult<T extends UniswapXOrderEntity> = {
  orders: T[]
  cursor?: string
}

/**
 * Reads and status writes on one order table, with the names of the backend's OrderStore
 * (packages/services/uniswapx/src/core/orders/OrderStore.ts) that ports them. The per-request
 * context comes with A9.
 */
export interface OrderStore<T extends UniswapXOrderEntity> {
  getByHash: (hash: string) => Promise<T | undefined>
  updateOrderStatus: (orderHash: string, status: ORDER_STATUS, fill?: StatusUpdateFill) => Promise<void>
}

// What only the post path uses.
export interface PostOrderStore<T extends UniswapXOrderEntity> {
  putOrderAndUpdateNonceTransaction: (order: T) => Promise<void>
  countOrdersByOffererAndStatus: (offerer: string, orderStatus: ORDER_STATUS) => Promise<number>
  getNonceByAddressAndChain: (address: string, chainId: number) => Promise<string | undefined>
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
