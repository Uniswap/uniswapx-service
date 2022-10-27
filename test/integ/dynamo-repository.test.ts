jest.unmock('aws-sdk')
jest.unmock('aws-sdk/clients/dynamodb')

import { DynamoDB } from 'aws-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'

const dynamoConfig = {
  endpoint: 'localhost:8000',
  region: 'local-env',
}

const documentClient = new DocumentClient(dynamoConfig)

DynamoOrdersRepository.initialize(documentClient)
const ordersRepository = new DynamoOrdersRepository()

describe('OrdersRepository put item test', () => {
  beforeAll(async () => {
    jest.useFakeTimers()
    const db = new DynamoDB(dynamoConfig)
    await db
      .createTable({
        TableName: 'Orders',
        AttributeDefinitions: [
          {
            AttributeName: 'orderHash',
            AttributeType: 'S',
          },
        ],
        KeySchema: [
          {
            AttributeName: 'orderHash',
            KeyType: 'HASH',
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 10,
        },
      })
      .promise()
  })

  it('should put an item', async () => {
    const order: OrderEntity = {
      orderHash: 'hash',
      encodedOrder: 'order',
      signature: 'sig',
      createdAt: 123,
      nonce: '1',
      orderStatus: ORDER_STATUS.OPEN,
    }

    await ordersRepository.put(order)
    const result = await ordersRepository.getByHash('0x123')
    expect(result).toEqual(order)
  })
})
