import { ORDER_STATUS, RelayOrderEntity, SettledAmount, SORT_FIELDS, UniswapXOrderEntity } from '../entities'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export const MODEL_NAME = {
  DUTCH: 'Order',
  LIMIT: 'LimitOrder',
  Relay: 'RelayOrder',
}

export type QueryResult = {
  orders: OrderEntityType[]
  cursor?: string
}

export type OrderEntityType = UniswapXOrderEntity | RelayOrderEntity

export interface BaseOrdersRepository<T extends OrderEntityType> {
  getByHash: (hash: string) => Promise<T | undefined>
  putOrderAndUpdateNonceTransaction: (order: T) => Promise<void>
  countOrdersByOffererAndStatus: (offerer: string, orderStatus: ORDER_STATUS) => Promise<number>
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams, cursor?: string) => Promise<QueryResult>
  getByOfferer: (offerer: string, limit: number) => Promise<QueryResult>
  getByOrderStatus: (
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ) => Promise<QueryResult>
  getNonceByAddressAndChain: (address: string, chainId: number) => Promise<string>
  updateOrderStatus: (
    orderHash: string,
    status: ORDER_STATUS,
    txHash?: string,
    settledAmounts?: SettledAmount[]
  ) => Promise<void>
  deleteOrders: (orderHashes: string[]) => Promise<void>
}
