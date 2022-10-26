import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import * as entites from '../entities/index'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository extends BaseOrdersRepository {
  private readonly documentClient: DocumentClient
  private readonly ordersTable: Table<'Orders', 'orderHash', null>
  private readonly orderEntity: any

  constructor(documentClient: DocumentClient) {
    super()
    this.documentClient = documentClient
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: this.documentClient,
    })
    this.orderEntity = new Entity({
      name: 'Order',
      attributes: {
        orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        encodedOrder: { type: DYNAMODB_TYPES.STRING, required: true },
        signature: { type: DYNAMODB_TYPES.STRING, required: true },
        orderStatus: { type: DYNAMODB_TYPES.STRING, required: true },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        offerer: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
      },
      table: this.ordersTable,
    } as const)
  }

  // TODO: confirm return types and make them explicit in the function definitions
  public async getByHash(hash: string) {
    const res = await this.orderEntity.get({ orderHash: hash })
    return res
  }
  public async put(order: entites.OrderEntity) {
    // TODO: implement
  }
}
