/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SORT_FIELDS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'
import * as nonceUtil from '../../lib/util/nonce'
import { getCurrentMonth, getCurrentTime } from '../../lib/util/time'

jest.mock('../../lib/util/time')

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

const MOCK_ORDER_1 = {
  orderHash: '0x1',
  offerer: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2 = {
  orderHash: '0x2',
  offerer: 'riley.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_3 = {
  orderHash: '0x3',
  offerer: 'riley.eth',
  encodedOrder: 'order3',
  signature: 'sig3',
  nonce: '2',
  orderStatus: ORDER_STATUS.FILLED,
}

const MOCK_ORDER_4 = {
  orderHash: '0x4',
  offerer: 'hayden.eth',
  encodedOrder: 'order4',
  signature: 'sig4',
  nonce: '4',
  orderStatus: ORDER_STATUS.OPEN,
}

const ADDITIONAL_FIELDS_ORDER_1 = {
  ...MOCK_ORDER_1,
  filler: '0x1',
}

const ADDITIONAL_FIELDS_ORDER_2 = {
  ...MOCK_ORDER_2,
  filler: '0x1',
}

const ADDITIONAL_FIELDS_ORDER_3 = {
  ...MOCK_ORDER_3,
  filler: '0x3',
}

const ADDITIONAL_FIELDS_ORDER_4 = {
  ...MOCK_ORDER_4,
  filler: '0x4',
}

const mockedGetCurrentMonth = jest.mocked(getCurrentMonth)
const mockedGetCurrentTime = jest.mocked(getCurrentTime)
mockedGetCurrentMonth.mockImplementation(() => 1)
const mockTimeAndMonth = (time: number) => {
  mockedGetCurrentTime.mockImplementation(() => time)
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = DynamoOrdersRepository.create(documentClient)

beforeAll(async () => {
  mockTimeAndMonth(1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1)
  mockTimeAndMonth(2)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_2)
  mockTimeAndMonth(3)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_3)
})

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      mockTimeAndMonth(1)
      ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1)
    }).not.toThrow()
  })
})

describe('OrdersRepository getOrders test', () => {
  it('should successfully get orders given an orderHash', async () => {
    const orders = await ordersRepository.getOrders(10, { orderHash: MOCK_ORDER_2.orderHash })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderHash', async () => {
    const orders = await ordersRepository.getOrders(10, { orderHash: '0x6' })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an offerer', async () => {
    const queryResult = await ordersRepository.getOrders(10, { offerer: MOCK_ORDER_2.offerer })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for offerer', async () => {
    const orders = await ordersRepository.getOrders(10, { offerer: 'zach.eth' })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.OPEN })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.UNVERIFIED })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given a filler', async () => {
    const queryResult = await ordersRepository.getOrders(10, { filler: ADDITIONAL_FIELDS_ORDER_1.filler })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for filler', async () => {
    const queryResult = await ordersRepository.getOrders(10, { filler: 'corn' })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given a filler and orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_1.filler,
      orderStatus: ORDER_STATUS.OPEN,
    })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for filler and orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_1.filler,
      orderStatus: ORDER_STATUS.UNVERIFIED,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given a filler and offerer', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      offerer: ADDITIONAL_FIELDS_ORDER_3.offerer,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for filler and offerer', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_4.filler,
      offerer: MOCK_ORDER_2.offerer,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given a filler, offerer, orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      offerer: ADDITIONAL_FIELDS_ORDER_3.offerer,
      orderStatus: ADDITIONAL_FIELDS_ORDER_3.orderStatus,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0].orderHash).toEqual(MOCK_ORDER_3.orderHash)
    expect(queryResult.orders[0].filler_offerer_orderStatus).toEqual(
      `${ADDITIONAL_FIELDS_ORDER_3.filler}_${MOCK_ORDER_3.offerer}_${MOCK_ORDER_3.orderStatus}`
    )
  })

  it('should return no orders for filler, offerer, orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      offerer: ADDITIONAL_FIELDS_ORDER_3.offerer,
      orderStatus: ADDITIONAL_FIELDS_ORDER_1.orderStatus,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given an offerer and orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      offerer: MOCK_ORDER_2.offerer,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_2,
        offerer_orderStatus: `${MOCK_ORDER_2.offerer}_${MOCK_ORDER_2.orderStatus}`,
      })
    )
  })

  it('should return no orders for offerer and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.UNVERIFIED,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders.orders).toEqual([])
  })

  it('should return orders for limit', async () => {
    const orders = await ordersRepository.getOrders(2, {})
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })
})

describe('OrdersRepository getOrders test with pagination', () => {
  it('should successfully page through orders with offerer', async () => {
    let orders = await ordersRepository.getOrders(1, { offerer: 'riley.eth' })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    orders = await ordersRepository.getOrders(2, { offerer: 'riley.eth' }, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should successfully page through orders with orderStatus', async () => {
    let orders = await ordersRepository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN }, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should successfully page through orders with limit', async () => {
    let orders = await ordersRepository.getOrders(2, {})
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    orders = await ordersRepository.getOrders(0, {}, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should throw an Error for cursor with the wrong index', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(() => ordersRepository.getOrders(0, { offerer: 'riley.eth' }, orders.cursor)).rejects.toThrow(
      Error('Invalid cursor.')
    )
  })

  it('should throw an Error for cursor with the wrong cursor', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(() => ordersRepository.getOrders(0, { offerer: 'riley.eth' }, 'wrong_cursor')).rejects.toThrow(
      Error('Invalid cursor.')
    )
  })
})

describe('OrdersRepository getOrders test with sorting', () => {
  it('should successfully get order given an offerer and createdAt sort', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      offerer: MOCK_ORDER_2.offerer,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lte(2)',
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no order given an offerer and createdAt sort', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      offerer: MOCK_ORDER_2.offerer,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lt(2)',
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'gte(2)',
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'gt(2)',
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given only sort for createdAt', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'between(1,3)',
    })
    expect(queryResult.orders.length).toEqual(3)
    expect(queryResult.orders[0]?.orderHash).toEqual(MOCK_ORDER_3.orderHash)
    expect(queryResult.orders[1]?.orderHash).toEqual(MOCK_ORDER_2.orderHash)
    expect(queryResult.orders[2]?.orderHash).toEqual(MOCK_ORDER_1.orderHash)
  })
})

describe('OrdersRepository getByHash test', () => {
  it('should successfully get an item from table', async () => {
    const order1 = await ordersRepository.getByHash(MOCK_ORDER_1.orderHash)
    // dynamodb-toolbox auto-generates 'created' and 'modified' fields
    expect(order1).toEqual(expect.objectContaining(MOCK_ORDER_1))

    const order2 = await ordersRepository.getByHash(MOCK_ORDER_2.orderHash)
    expect(order2).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return undefined if item does not exist', async () => {
    const res = await ordersRepository.getByHash('0x4')
    expect(res).toBeUndefined()
  })
})

describe('OrdersRepository get nonce test', () => {
  it('should successfully get last posted nonce from table', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '4',
    })
    const nonce = await ordersRepository.getNonceByAddress('hayden.eth')
    expect(nonce).toEqual('4')
  })

  it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '2',
      orderHash: '0x4',
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

describe('OrdersRepository get order count by offerer test', () => {
  it('should successfully return order count by existing offerer', async () => {
    mockTimeAndMonth(4)
    await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_4)
    expect(await ordersRepository.countOrdersByOffererAndStatus(MOCK_ORDER_4.offerer, ORDER_STATUS.OPEN)).toEqual(2)
  })

  it('should return 0 for nonexistent offerer', async () => {
    expect(await ordersRepository.countOrdersByOffererAndStatus('nonexistent', ORDER_STATUS.OPEN)).toEqual(0)
  })
})

describe('OrdersRepository update status test', () => {
  it('should successfully update orderStatus of an order identified by orderHash', async () => {
    await ordersRepository.updateOrderStatus('0x1', ORDER_STATUS.FILLED, 'txHash')
    await expect(ordersRepository.getByHash('0x1')).resolves.toMatchObject({
      orderStatus: ORDER_STATUS.FILLED,
      offerer_orderStatus: `${MOCK_ORDER_1.offerer}_${ORDER_STATUS.FILLED}`,
      txHash: 'txHash',
    })
  })

  it('should throw error if order does not exist', async () => {
    await expect(ordersRepository.updateOrderStatus('nonexistent', ORDER_STATUS.FILLED)).rejects.toEqual(
      new Error('cannot find order by hash when updating order status')
    )
  })
})
