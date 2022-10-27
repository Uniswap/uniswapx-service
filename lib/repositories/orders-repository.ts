import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'
import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity } from '../entities/Order'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private readonly ordersTable: Table
  private readonly orderEntity: any

  constructor(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        offererIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.CREATED_AT },
        orderStatusIndex: { partitionKey: TABLE_KEY.ORDER_STATUS, sortKey: TABLE_KEY.CREATED_AT },
        sellTokenIndex: { partitionKey: TABLE_KEY.SELL_TOKEN, sortKey: TABLE_KEY.CREATED_AT },
        offererOrderStatusIndex: { partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS, sortKey: TABLE_KEY.SELL_TOKEN },
        offererSellTokenIndex: { partitionKey: TABLE_KEY.OFFERER_SELL_TOKEN },
        sellTokenOrderStatusIndex: { partitionKey: TABLE_KEY.SELL_TOKEN_ORDER_STATUS },
      },
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

  async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await this.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash })
    return res.Item as OrderEntity
  }

  async put(order: OrderEntity): Promise<void> {
    await this.orderEntity.put(order)
  }
}
