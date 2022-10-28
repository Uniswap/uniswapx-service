import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'
import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity } from '../entities/Order'
import { generateRandomNonce } from '../util/nonce'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private static ordersTable: Table
  private static nonceTable: Table
  private static orderEntity: any
  private static nonceEntity: any

  static initialize(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        offererIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.CREATED_AT },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
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
        offerer: { type: DYNAMODB_TYPES.STRING, required: true },
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
      },
      table: this.ordersTable,
    } as const)

    this.nonceTable = new Table({
      name: 'Nonces',
      partitionKey: 'offerer',
      DocumentClient: documentClient,
    })

    this.nonceEntity = new Entity({
      name: 'Nonce',
      attributes: {
        offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
      },
      table: this.nonceTable,
    } as const)
  }

  async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await DynamoOrdersRepository.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash })
    return res.Item as OrderEntity
  }

  async getNonceByAddress(address: string): Promise<string> {
    const res = await DynamoOrdersRepository.nonceEntity.query(address, {
      limit: 1,
      reverse: true,
      consistent: true,
    })
    return res.Items.length > 0 ? res.Items[0].nonce : generateRandomNonce()
  }

  async putOrderAndUpdateNonceTransaction(order: OrderEntity): Promise<void> {
    await DynamoOrdersRepository.ordersTable.transactWrite(
      [
        DynamoOrdersRepository.orderEntity.putTransaction(order),
        DynamoOrdersRepository.nonceEntity.updateTransaction({
          offerer: order.offerer,
          nonce: order.nonce,
        }),
      ],
      {
        capacity: 'total',
      }
    )
  }
}
