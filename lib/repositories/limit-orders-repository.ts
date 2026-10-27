import { DocumentClient } from 'aws-sdk/clients/dynamodb'

import { UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, MODEL_NAME } from './base'
import { createOrdersRepository, ORDER_ATTRIBUTES } from './create-orders-repository'
import { GenericOrdersRepository } from './generic-orders-repository'
import { OrdersQueryCache } from './QueryCache'
import { TABLE_NAMES } from './util'

// Callers still name the repository type after the table.
export type LimitOrdersRepository = GenericOrdersRepository
export const LimitOrdersRepository = {
  // Only the shared attributes, not the Orders table's Dutch-only ones: toolbox drops undeclared
  // fields on write, so this list is exactly what a LimitOrders row can hold.
  create: (documentClient: DocumentClient, queryCache?: OrdersQueryCache): BaseOrdersRepository<UniswapXOrderEntity> =>
    createOrdersRepository(
      {
        tableName: TABLE_NAMES.LimitOrders,
        entityName: MODEL_NAME.LIMIT,
        logName: 'LimitOrdersRepository',
        attributes: ORDER_ATTRIBUTES,
      },
      documentClient,
      queryCache
    ),
}
