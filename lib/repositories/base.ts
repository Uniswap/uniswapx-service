import { OrderEntity, ORDER_STATUS } from '../entities/index'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity | undefined>
  putOrderAndUpdateNonceTransaction: (order: OrderEntity) => Promise<void>
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams) => Promise<(OrderEntity | undefined)[]>
  getByOfferer: (offerer: string, limit: number) => Promise<OrderEntity[]>
  getByOrderStatus: (orderStatus: string, limit: number) => Promise<OrderEntity[]>
  getBySellToken: (sellToken: string, limit: number) => Promise<OrderEntity[]>
  getNonceByAddress: (address: string) => Promise<string>
  updateOrderStatus: (orderHash: string, status: ORDER_STATUS) => Promise<void>
}
