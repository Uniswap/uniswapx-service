import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'
import * as nonceUtil from '../../lib/util/nonce'

const dynamoConfig = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
}

const MOCK_ORDER_1: OrderEntity = {
  orderHash: '0x1',
  offerer: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2: OrderEntity = {
  orderHash: '0x2',
  offerer: 'hayden.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '2',
  orderStatus: ORDER_STATUS.OPEN,
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = new DynamoOrdersRepository()
DynamoOrdersRepository.initialize(documentClient)

beforeAll(async () => {
  await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_2)
})

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_1)
    }).not.toThrow()
  })
})

<<<<<<< HEAD
describe('OrdersRepository get item test', () => {
=======
describe('OrdersRepository getOrders test', () => {
  it('should successfully get orders given an orderHash', async () => {
    const orders = await ordersRepository.getOrders(10, { orderHash: MOCK_ORDER_2.orderHash })
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderHash', async () => {
    const orders = await ordersRepository.getOrders(10, { orderHash: '0x6' })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given an offerer', async () => {
    const orders = await ordersRepository.getOrders(10, { offerer: MOCK_ORDER_1.offerer })
    expect(orders).toEqual([MOCK_ORDER_1])
  })

  it('should return no orders for offerer', async () => {
    const orders = await ordersRepository.getOrders(10, { offerer: 'zach.eth' })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders).toEqual([MOCK_ORDER_2, MOCK_ORDER_1])
  })

  it('should return no orders for orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.UNVERIFIED })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken', async () => {
    const orders = await ordersRepository.getOrders(10, { sellToken: MOCK_ORDER_1.sellToken })
    expect(orders).toEqual([MOCK_ORDER_1])
  })

  it('should return no orders for sellToken', async () => {
    const orders = await ordersRepository.getOrders(10, { sellToken: 'corn' })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken, offerer, and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      orderStatus: ORDER_STATUS.OPEN,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders).toEqual([MOCK_ORDER_1])
  })

  it('should return no orders for sellToken, offerer, and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      orderStatus: ORDER_STATUS.UNVERIFIED,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given an offerer and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      offerer: MOCK_ORDER_2.offerer,
    })
    expect(orders).toEqual([MOCK_ORDER_2])
  })

  it('should return no orders for offerer and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.UNVERIFIED,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken and offerer', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders).toEqual([MOCK_ORDER_1])
  })

  it('should return no orders for sellToken and offerer', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: 'corn',
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      orderStatus: ORDER_STATUS.OPEN,
    })
    expect(orders).toEqual([MOCK_ORDER_1])
  })

  it('should return no orders for sellToken and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: 'corn',
      orderStatus: ORDER_STATUS.UNVERIFIED,
    })
    expect(orders).toEqual([])
  })

  it('should return orders for limit', async () => {
    const orders = await ordersRepository.getOrders(10, {})
    expect(orders).toEqual([MOCK_ORDER_2, MOCK_ORDER_1])
  })
})

describe('OrdersRepository getByHash test', () => {
>>>>>>> 8df148e (Adding test coverage report.)
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

describe('OrdersRepository get nonce test', () => {
  it('should successfully get last posted nonce from table', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '3',
    })
    const nonce = await ordersRepository.getNonceByAddress('hayden.eth')
    expect(nonce).toEqual('3')
  })

  it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '2',
      orderHash: '0x3',
    })
    // at this point, there are three orders in the DB, two with nonce 2
    const nonce = await ordersRepository.getNonceByAddress('hayden.eth')
    expect(nonce).toEqual('2')
  })

  it('should generate random nonce for new address', async () => {
    const spy = jest.spyOn(nonceUtil, 'generateRandomNonce')
    const res = await ordersRepository.getNonceByAddress('random.eth')
    expect(res).not.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })
})
