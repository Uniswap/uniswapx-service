import { ORDER_STATUS } from '../../entities'
import { GetOrdersQueryParams } from '../../handlers/get-orders/schema'
import { OrderEntityType } from '../base'

export type IndexFieldsForUpdate = {
  [key: string]: string
}

export interface IndexMapper<T extends OrderEntityType> {
  getIndexFromParams(queryFilters: GetOrdersQueryParams): { index: string; partitionKey: string | number } | undefined
  getIndexFieldsForUpdate(order: T): IndexFieldsForUpdate
  getIndexFieldsForStatusUpdate(order: T, newStatus: ORDER_STATUS): IndexFieldsForUpdate
}
