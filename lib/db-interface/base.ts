import Logger from "bunyan"
import { Order } from '../handlers/types/order'

export interface BaseOrdersInterface{
    documentClient: any
    tableName: string
    getOrders: (limit: number, queryFilters: { [key: string]: string }, _log?: Logger) => Promise<Order[]>
}
