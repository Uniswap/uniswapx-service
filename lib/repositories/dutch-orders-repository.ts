import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, MODEL_NAME } from './base'
import { GenericOrdersRepository } from './generic-orders-repository'
import { OffchainOrderIndexMapper } from './IndexMappers/OffchainOrderIndexMapper'
import { getTableIndices, TABLE_NAMES } from './util'

export class DutchOrdersRepository extends GenericOrdersRepository<string, string, null, UniswapXOrderEntity> {
  static create(documentClient: DocumentClient): BaseOrdersRepository<UniswapXOrderEntity> {
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
        //off chain requirements
        orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        encodedOrder: { type: DYNAMODB_TYPES.STRING, required: true },
        signature: { type: DYNAMODB_TYPES.STRING, required: true },
        orderStatus: { type: DYNAMODB_TYPES.STRING, required: true },
        createdAt: { type: DYNAMODB_TYPES.NUMBER },
        type: { type: DYNAMODB_TYPES.STRING },
        chainId: { type: DYNAMODB_TYPES.NUMBER },
        cosignerData: { type: DYNAMODB_TYPES.MAP },
        cosignature: { type: DYNAMODB_TYPES.STRING },
        auctionStartBlock: { type: DYNAMODB_TYPES.NUMBER },
        baselinePriorityFeeWei: { type: DYNAMODB_TYPES.STRING },
        startingBaseFee: { type: DYNAMODB_TYPES.STRING },
        cosigner: { type: DYNAMODB_TYPES.STRING },
        referencePrice: { type: DYNAMODB_TYPES.STRING },
        priceImpact: { type: DYNAMODB_TYPES.NUMBER },
        blockNumber: { type: DYNAMODB_TYPES.NUMBER },
        route: { type: DYNAMODB_TYPES.MAP },
        usedUnimind: {type: DYNAMODB_TYPES.BOOLEAN},
        //on chain data
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
        offerer: { type: DYNAMODB_TYPES.STRING, required: true },
        filler: { type: DYNAMODB_TYPES.STRING },
        decayStartTime: { type: DYNAMODB_TYPES.NUMBER },
        decayStartBlock: { type: DYNAMODB_TYPES.NUMBER },
        decayEndTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        input: { type: DYNAMODB_TYPES.MAP },
        outputs: { type: DYNAMODB_TYPES.LIST },
        quoteId: { type: DYNAMODB_TYPES.STRING },
        requestId: { type: DYNAMODB_TYPES.STRING },
        txHash: { type: DYNAMODB_TYPES.STRING },
        fillBlock: { type: DYNAMODB_TYPES.NUMBER },
        settledAmounts: { type: DYNAMODB_TYPES.LIST },

        //indexes
        offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_offerer: { type: DYNAMODB_TYPES.STRING },
        chainId_filler: { type: DYNAMODB_TYPES.STRING },
        chainId_orderStatus: { type: DYNAMODB_TYPES.STRING },
        chainId_orderStatus_filler: { type: DYNAMODB_TYPES.STRING },
        filler_offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        pair: { type: DYNAMODB_TYPES.STRING },
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

    return new DutchOrdersRepository(ordersTable, orderEntity, nonceEntity, log, new OffchainOrderIndexMapper())
  }
}
