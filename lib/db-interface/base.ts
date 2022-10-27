import Logger from 'bunyan'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { Order } from '../handlers/types/order'

export interface BaseOrdersInterface {
  documentClient: any
  tableName: string
  getOrders: (limit: number, queryFilters: GetOrdersQueryParams, _log?: Logger) => Promise<Order[]>
}
