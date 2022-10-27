import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'

const dynamoConfig = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
}

const MOCK_ORDER_1: OrderEntity = {
  orderHash: '0x1',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2: OrderEntity = {
  orderHash: '0x2',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '2',
  orderStatus: ORDER_STATUS.OPEN,
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = new DynamoOrdersRepository(documentClient)

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      ordersRepository.put(MOCK_ORDER_1)
    }).not.toThrow()
  })
})

describe('OrdersRepository get item test', () => {
  beforeAll(async () => {
    await ordersRepository.put(MOCK_ORDER_1)
    await ordersRepository.put(MOCK_ORDER_2)
  })

  it('should successfully get an item from table', async () => {
    const order1 = await ordersRepository.getByHash(MOCK_ORDER_1.orderHash)
    // dynamodb-toolbox auto-generates 'created' and 'modified' fields
    expect(order1).toEqual(expect.objectContaining(MOCK_ORDER_1))

    const order2 = await ordersRepository.getByHash(MOCK_ORDER_2.orderHash)
    expect(order2).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return undefined if item does not exist', async () => {
    const res = await ordersRepository.getByHash('0x3')
    expect(res).toBeUndefined()
  })
})
