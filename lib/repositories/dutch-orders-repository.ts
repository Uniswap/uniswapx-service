import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { BaseOrdersRepository, MODEL_NAME } from './base'
import { GenericOrdersRepository } from './generic-orders-repository'
import { getTableIndices, TABLE_NAMES } from './util'

export class DutchOrdersRepository extends GenericOrdersRepository<string, string, null> {
  static create(documentClient: DocumentClient): BaseOrdersRepository {
    const log = Logger.createLogger({
      name: 'DutchOrdersRepository',
      serializers: Logger.stdSerializers,
    })

    const ordersTable = new Table({
      name: TABLE_NAMES.Orders,
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: getTableIndices(TABLE_NAMES.Orders),
    })

    const orderEntity = new Entity({
      name: MODEL_NAME.DUTCH,
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
      table: ordersTable,
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

    return new GenericOrdersRepository(ordersTable, orderEntity, nonceEntity, log)
  }
}
