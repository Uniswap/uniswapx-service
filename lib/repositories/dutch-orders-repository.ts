import { DocumentClient } from 'aws-sdk/clients/dynamodb'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, MODEL_NAME } from './base'
import { createOrdersRepository, ORDER_ATTRIBUTES } from './create-orders-repository'
import { GenericOrdersRepository } from './generic-orders-repository'
import { OrdersQueryCache } from './QueryCache'
import { TABLE_NAMES } from './util'

// Fields the Orders table stores and LimitOrders does not.
const DUTCH_ONLY_ATTRIBUTES = {
  cosignerData: { type: DYNAMODB_TYPES.MAP },
  cosignature: { type: DYNAMODB_TYPES.STRING },
  auctionStartBlock: { type: DYNAMODB_TYPES.NUMBER },
  baselinePriorityFeeWei: { type: DYNAMODB_TYPES.STRING },
  startingBaseFee: { type: DYNAMODB_TYPES.STRING },
  cosigner: { type: DYNAMODB_TYPES.STRING },
  decayStartBlock: { type: DYNAMODB_TYPES.NUMBER },
  requestId: { type: DYNAMODB_TYPES.STRING },
} as const

// Callers still name the repository type after the table.
export type DutchOrdersRepository = GenericOrdersRepository
export const DutchOrdersRepository = {
  create: (documentClient: DocumentClient, queryCache?: OrdersQueryCache): BaseOrdersRepository<UniswapXOrderEntity> =>
    createOrdersRepository(
      {
        tableName: TABLE_NAMES.Orders,
        entityName: MODEL_NAME.DUTCH,
        logName: 'DutchOrdersRepository',
        attributes: { ...ORDER_ATTRIBUTES, ...DUTCH_ONLY_ATTRIBUTES },
      },
      documentClient,
      queryCache
    ),
}
