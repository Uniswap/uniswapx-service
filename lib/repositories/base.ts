import { OrderEntity, ORDER_STATUS, SORT_FIELDS } from '../entities/index'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export type QueryResult = {
  orders: OrderEntity[]
  cursor?: string
}

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity | undefined>
  putOrderAndUpdateNonceTransaction: (order: OrderEntity) => Promise<void>
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams, cursor?: string) => Promise<QueryResult>
  getByOfferer: (offerer: string, sortKey: SORT_FIELDS, limit: number) => Promise<QueryResult>
  getByOrderStatus: (orderStatus: string, limit: number) => Promise<QueryResult>
  getBySellToken: (sellToken: string, limit: number) => Promise<QueryResult>
  getNonceByAddress: (address: string) => Promise<string>
  updateOrderStatus: (orderHash: string, status: ORDER_STATUS) => Promise<void>
}
