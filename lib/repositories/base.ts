import { ORDER_STATUS, RelayOrderEntity, SettledAmount, SORT_FIELDS, UniswapXOrderEntity } from '../entities'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export const MODEL_NAME = {
  DUTCH: 'Order',
  LIMIT: 'LimitOrder',
  Relay: 'RelayOrder',
}

export type QueryResult<T extends OrderEntityType> = {
  orders: T[]
  cursor?: string
}

export type OrderEntityType = UniswapXOrderEntity | RelayOrderEntity

export interface BaseOrdersRepository<T extends OrderEntityType> {
  getByHash: (hash: string) => Promise<T | undefined>
  putOrderAndUpdateNonceTransaction: (order: T) => Promise<void>
  countOrdersByOffererAndStatus: (offerer: string, orderStatus: ORDER_STATUS) => Promise<number>
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams, cursor?: string) => Promise<QueryResult<T>>
  getOrdersFilteredByType: (
    limit: number,
    queryFilters: GetOrdersQueryParams,
    types: string[],
    cursor?: string
  ) => Promise<QueryResult<T>>
  getByOfferer: (offerer: string, limit: number) => Promise<QueryResult<T>>
  getByOrderStatus: (
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ) => Promise<QueryResult<T>>
  getNonceByAddressAndChain: (address: string, chainId: number) => Promise<string>
  updateOrderStatus: (
    orderHash: string,
    status: ORDER_STATUS,
    txHash?: string,
    settledAmounts?: SettledAmount[]
  ) => Promise<void>
  deleteOrders: (orderHashes: string[]) => Promise<void>
}
