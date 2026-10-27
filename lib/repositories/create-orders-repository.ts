import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { GenericOrdersRepository } from './generic-orders-repository'
import { NonceRepository } from './nonce-repository'
import { OrdersQueryCache } from './QueryCache'
import { getTableIndices, TABLE_NAMES } from './util'

// The attributes every order table stores. dynamodb-toolbox drops undeclared fields on write, so
// a table's attribute list is exactly the set of fields its rows carry.
export const ORDER_ATTRIBUTES = {
  orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
  encodedOrder: { type: DYNAMODB_TYPES.STRING, required: true },
  signature: { type: DYNAMODB_TYPES.STRING, required: true },
  orderStatus: { type: DYNAMODB_TYPES.STRING, required: true },
  nonce: { type: DYNAMODB_TYPES.STRING, required: true },
  offerer: { type: DYNAMODB_TYPES.STRING, required: true },
  filler: { type: DYNAMODB_TYPES.STRING },
  decayStartTime: { type: DYNAMODB_TYPES.NUMBER },
  decayEndTime: { type: DYNAMODB_TYPES.NUMBER },
  deadline: { type: DYNAMODB_TYPES.NUMBER },
  createdAt: { type: DYNAMODB_TYPES.NUMBER },
  reactor: { type: DYNAMODB_TYPES.STRING },
  type: { type: DYNAMODB_TYPES.STRING },
  chainId: { type: DYNAMODB_TYPES.NUMBER },
  input: { type: DYNAMODB_TYPES.MAP },
  outputs: { type: DYNAMODB_TYPES.LIST },
  offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
  filler_orderStatus: { type: DYNAMODB_TYPES.STRING },
  filler_offerer: { type: DYNAMODB_TYPES.STRING },
  chainId_filler: { type: DYNAMODB_TYPES.STRING },
  chainId_orderStatus: { type: DYNAMODB_TYPES.STRING },
  chainId_orderStatus_filler: { type: DYNAMODB_TYPES.STRING },
  filler_offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
  quoteId: { type: DYNAMODB_TYPES.STRING },
  txHash: { type: DYNAMODB_TYPES.STRING },
  fillBlock: { type: DYNAMODB_TYPES.NUMBER },
  fillTimestamp: { type: DYNAMODB_TYPES.NUMBER },
  settledAmounts: { type: DYNAMODB_TYPES.LIST },
  pair: { type: DYNAMODB_TYPES.STRING },
} as const

export type OrdersTableConfig = {
  tableName: TABLE_NAMES
  // Stored on every row as `_et`.
  entityName: string
  logName: string
  attributes: ConstructorParameters<typeof Entity>[0]['attributes']
}

export function createOrdersRepository(
  { tableName, entityName, logName, attributes }: OrdersTableConfig,
  documentClient: DocumentClient,
  queryCache?: OrdersQueryCache
): GenericOrdersRepository {
  const log = Logger.createLogger({
    name: logName,
    serializers: Logger.stdSerializers,
  })

  const table = new Table({
    name: tableName,
    partitionKey: 'orderHash',
    DocumentClient: documentClient,
    indexes: getTableIndices(),
  })

  const entity = new Entity({
    name: entityName,
    attributes,
    table,
  } as const)

  return new GenericOrdersRepository(table, entity, NonceRepository.create(documentClient), log, queryCache)
}
