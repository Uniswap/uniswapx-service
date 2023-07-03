/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SORT_FIELDS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'
import * as nonceUtil from '../../lib/util/nonce'
import { currentTimestampInSeconds } from '../../lib/util/time'

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
  swapper: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  chainId: 1,
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2 = {
  orderHash: '0x2',
  swapper: 'riley.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '1',
  chainId: 137,
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_3 = {
  orderHash: '0x3',
  swapper: 'riley.eth',
  encodedOrder: 'order3',
  signature: 'sig3',
  nonce: '2',
  chainId: 137,
  orderStatus: ORDER_STATUS.FILLED,
}

const MOCK_ORDER_4 = {
  orderHash: '0x4',
  swapper: 'hayden.eth',
  encodedOrder: 'order4',
  signature: 'sig4',
  nonce: '4',
  chainId: 1,
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

const mockedGetCurrentTime = jest.mocked(currentTimestampInSeconds)
const mockTime = (time: number) => {
  mockedGetCurrentTime.mockImplementation(() => time.toString())
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = DynamoOrdersRepository.create(documentClient)

beforeAll(async () => {
  mockTime(1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1)
  mockTime(2)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_2)
  mockTime(3)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_3)
})

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      mockTime(1)
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

  it('should successfully get orders given orderHashes', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderHashes: [MOCK_ORDER_2.orderHash, MOCK_ORDER_3.orderHash],
    })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderHashes', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderHashes: ['0x6', '0x7'],
    })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an swapper', async () => {
    const queryResult = await ordersRepository.getOrders(10, { swapper: MOCK_ORDER_2.swapper })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for swapper', async () => {
    const orders = await ordersRepository.getOrders(10, { swapper: 'zach.eth' })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.OPEN })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an chainId', async () => {
    const queryResult = await ordersRepository.getOrders(10, { chainId: 137 })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for chainId', async () => {
    const orders = await ordersRepository.getOrders(10, { chainId: 5 })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an chainId and filler', async () => {
    const queryResult = await ordersRepository.getOrders(10, { chainId: 137, filler: '0x1' })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for chainId and filler', async () => {
    const orders = await ordersRepository.getOrders(10, { chainId: 137, filler: '0x5' })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an chainId and orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, { chainId: 1, orderStatus: ORDER_STATUS.OPEN })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
  })

  it('should return no orders for chainId and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { chainId: 1, orderStatus: ORDER_STATUS.EXPIRED })
    expect(orders.orders).toEqual([])
  })

  it('should successfully get orders given an chainId, orderStatus, and filler', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      chainId: 137,
      orderStatus: ORDER_STATUS.FILLED,
      filler: '0x3',
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for chainId and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { chainId: 137, orderStatus: ORDER_STATUS.OPEN, filler: '0x3' })
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
      orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given a filler and swapper', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      swapper: ADDITIONAL_FIELDS_ORDER_3.swapper,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for filler and swapper', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_4.filler,
      swapper: MOCK_ORDER_2.swapper,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given a filler, swapper, orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      swapper: ADDITIONAL_FIELDS_ORDER_3.swapper,
      orderStatus: ADDITIONAL_FIELDS_ORDER_3.orderStatus,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0].orderHash).toEqual(MOCK_ORDER_3.orderHash)
    expect(queryResult.orders[0].filler_swapper_orderStatus).toEqual(
      `${ADDITIONAL_FIELDS_ORDER_3.filler}_${MOCK_ORDER_3.swapper}_${MOCK_ORDER_3.orderStatus}`
    )
  })

  it('should return no orders for filler, swapper, orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      filler: ADDITIONAL_FIELDS_ORDER_3.filler,
      swapper: ADDITIONAL_FIELDS_ORDER_3.swapper,
      orderStatus: ADDITIONAL_FIELDS_ORDER_1.orderStatus,
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should successfully get orders given an swapper and orderStatus', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      swapper: MOCK_ORDER_2.swapper,
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_2,
        swapper_orderStatus: `${MOCK_ORDER_2.swapper}_${MOCK_ORDER_2.orderStatus}`,
      })
    )
  })

  it('should return no orders for swapper and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      swapper: MOCK_ORDER_1.swapper,
    })
    expect(orders.orders).toEqual([])
  })

  it('should return orders for limit', async () => {
    await expect(ordersRepository.getOrders(2, {})).rejects.toThrow(
      'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler]'
    )
  })
})

describe('OrdersRepository getOrders test with pagination', () => {
  it('should successfully page through orders with swapper', async () => {
    let orders = await ordersRepository.getOrders(1, { swapper: 'riley.eth' })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    orders = await ordersRepository.getOrders(2, { swapper: 'riley.eth' }, orders.cursor)
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

  it('should successfully page through orders with chainId', async () => {
    let orders = await ordersRepository.getOrders(1, { chainId: 137 })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    orders = await ordersRepository.getOrders(2, { chainId: 137 }, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should throw an Error for cursor with the wrong index', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(() => ordersRepository.getOrders(0, { swapper: 'riley.eth' }, orders.cursor)).rejects.toThrow(
      Error('Invalid cursor.')
    )
  })

  it('should throw an Error for cursor with the wrong cursor', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(() => ordersRepository.getOrders(0, { swapper: 'riley.eth' }, 'wrong_cursor')).rejects.toThrow(
      Error('Invalid cursor.')
    )
  })
})

describe('OrdersRepository getOrders test with sorting', () => {
  it('should successfully get order given an swapper and createdAt sort', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      swapper: MOCK_ORDER_2.swapper,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lte(2)',
    })
    expect(queryResult.orders.length).toEqual(1)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no order given an swapper and createdAt sort', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      swapper: MOCK_ORDER_2.swapper,
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
      orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'gt(2)',
    })
    expect(queryResult.orders).toEqual([])
  })

  it('should return all orders for OPEN status and between 1,3 time', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'between(1,3)',
      desc: true,
    })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_1))
  })

  it('should return all orders for OPEN status and between 1,3 time ascending order', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'between(1,3)',
      desc: false,
    })
    expect(queryResult.orders.length).toEqual(2)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
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
    const nonce = await ordersRepository.getNonceByAddressAndChain('hayden.eth', MOCK_ORDER_1.chainId)
    expect(nonce).toEqual('4')
  })

  it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '2',
      orderHash: '0x4',
    })
    // at this point, there are three orders in the DB, two with nonce 2
    const nonce = await ordersRepository.getNonceByAddressAndChain('hayden.eth', MOCK_ORDER_1.chainId)
    expect(nonce).toEqual('2')
  })

  it('should generate random nonce for new address', async () => {
    const spy = jest.spyOn(nonceUtil, 'generateRandomNonce')
    const res = await ordersRepository.getNonceByAddressAndChain('random.eth')
    expect(res).not.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })

  it('should track nonce for the same address on different chains separately', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_2,
      nonce: '10',
    })
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_2,
      chainId: 1,
      nonce: '20',
    })
    const nonce = await ordersRepository.getNonceByAddressAndChain(MOCK_ORDER_2.swapper, MOCK_ORDER_2.chainId)
    expect(nonce).toEqual('10')
    const nonce2 = await ordersRepository.getNonceByAddressAndChain(MOCK_ORDER_2.swapper, 1)
    expect(nonce2).toEqual('20')
  })
})

describe('OrdersRepository get order count by swapper test', () => {
  it('should successfully return order count by existing swapper', async () => {
    mockTime(4)
    await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_4)
    expect(await ordersRepository.countOrdersByOffererAndStatus(MOCK_ORDER_4.swapper, ORDER_STATUS.OPEN)).toEqual(2)
  })

  it('should return 0 for nonexistent swapper', async () => {
    expect(await ordersRepository.countOrdersByOffererAndStatus('nonexistent', ORDER_STATUS.OPEN)).toEqual(0)
  })
})

describe('OrdersRepository update status test', () => {
  it('should successfully update orderStatus of an order identified by orderHash', async () => {
    await ordersRepository.updateOrderStatus('0x1', ORDER_STATUS.FILLED, 'txHash', [
      { tokenOut: '0x1', amountOut: '1' },
    ])
    await expect(ordersRepository.getByHash('0x1')).resolves.toMatchObject({
      orderStatus: ORDER_STATUS.FILLED,
      swapper_orderStatus: `${MOCK_ORDER_1.swapper}_${ORDER_STATUS.FILLED}`,
      chainId_orderStatus: `${MOCK_ORDER_1.chainId}_${ORDER_STATUS.FILLED}`,
      chainId_orderStatus_filler: `${MOCK_ORDER_1.chainId}_${ORDER_STATUS.FILLED}_${MOCK_ORDER_1.filler}`,
      txHash: 'txHash',
      settledAmounts: [{ tokenOut: '0x1', amountOut: '1' }],
    })
  })

  it('should throw error if order does not exist', async () => {
    await expect(ordersRepository.updateOrderStatus('nonexistent', ORDER_STATUS.FILLED)).rejects.toEqual(
      new Error('cannot find order by hash when updating order status')
    )
  })
})
