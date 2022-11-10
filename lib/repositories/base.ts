import { OrderEntity, SORT_FIELDS } from '../entities/index'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity | undefined>
  putOrderAndUpdateNonceTransaction: (order: OrderEntity) => Promise<void>
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams) => Promise<(OrderEntity | undefined)[]>
  getByOfferer: (offerer: string, limit: number, sortKey?: SORT_FIELDS, sort?: string) => Promise<OrderEntity[]>
  getByOrderStatus: (orderStatus: string, limit: number, sortKey?: SORT_FIELDS, sort?: string) => Promise<OrderEntity[]>
  getBySellToken: (sellToken: string, limit: number, sortKey?: SORT_FIELDS, sort?: string) => Promise<OrderEntity[]>
  getNonceByAddress: (address: string) => Promise<string>
}
