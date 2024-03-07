import { GetOrdersQueryParams } from '../../handlers/get-orders/schema'
import { OrderEntityType } from '../base'

export type IndexFieldsForUpdate = {
  [key: string]: string
}

export interface IndexMapper<T extends OrderEntityType> {
  getIndexFromParams(queryFilters: GetOrdersQueryParams): { index: string; partitionKey: string | number } | undefined
  getCompoundIndexFieldsForUpdate(order: T): IndexFieldsForUpdate
}
