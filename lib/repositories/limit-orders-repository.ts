import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { OrderEntity } from '../entities'
import { BaseOrdersRepository, MODEL_NAME } from './base'
import { GenericOrdersRepository } from './generic-orders-repository'
import { DutchIndexMapper } from './IndexMappers/DutchIndexMapper'
import { getTableIndices, TABLE_NAMES } from './util'

export class LimitOrdersRepository extends GenericOrdersRepository<string, string, null, OrderEntity> {
  static create(documentClient: DocumentClient): BaseOrdersRepository<OrderEntity> {
    const log = Logger.createLogger({
      name: 'LimitOrdersRepository',
      serializers: Logger.stdSerializers,
    })

    const limitOrdersTable = new Table({
      name: TABLE_NAMES.LimitOrders,
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: getTableIndices(TABLE_NAMES.LimitOrders),
    })

    const limitOrderEntity = new Entity({
      name: MODEL_NAME.LIMIT,
      attributes: {
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
        settledAmounts: { type: DYNAMODB_TYPES.LIST },
      },
      table: limitOrdersTable,
    } as const)

    const nonceTable = new Table({
      name: TABLE_NAMES.Nonces,
      partitionKey: 'offerer',
      DocumentClient: documentClient,
    })

    const nonceEntity = new Entity({
      name: 'Nonce',
      attributes: {
        offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
      },
      table: nonceTable,
    } as const)

    return new LimitOrdersRepository(limitOrdersTable, limitOrderEntity, nonceEntity, log, new DutchIndexMapper())
  }
}
