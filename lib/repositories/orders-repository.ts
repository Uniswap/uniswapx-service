import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { OrderEntity } from '../entities/Order'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private static ordersTable: Table<'Orders', 'orderHash', null>
  private static orderEntity: any

  static initialize(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
    })

    this.orderEntity = new Entity({
      name: 'Order',
      attributes: {
        orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        encodedOrder: { type: DYNAMODB_TYPES.STRING, required: true },
        signature: { type: DYNAMODB_TYPES.STRING, required: true },
        orderStatus: { type: DYNAMODB_TYPES.STRING, required: true },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
        createdAt: { type: DYNAMODB_TYPES.NUMBER, required: true },
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

  async getByHash(hash: string): Promise<OrderEntity[]> {
    return await DynamoOrdersRepository.orderEntity.get(hash)
  }

  async put(order: OrderEntity): Promise<void> {
    await DynamoOrdersRepository.orderEntity.put(order)
  }
}
