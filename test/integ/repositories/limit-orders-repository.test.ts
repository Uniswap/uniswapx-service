/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SORT_FIELDS } from '../../../lib/entities/Order'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { generateRandomNonce } from '../../../lib/util/nonce'
import { currentTimestampInSeconds } from '../../../lib/util/time'
import { deleteAllRepoEntries } from './deleteAllRepoEntries'

jest.mock('../../../lib/util/time')

jest.mock('../../../lib/util/nonce', () => {
  const originalModule = jest.requireActual('../../../lib/util/nonce')

  return {
    ...originalModule,
    generateRandomNonce: jest.fn(originalModule.generateRandomNonce),
  }
})

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
  chainId: 1,
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2 = {
  orderHash: '0x2',
  offerer: 'riley.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '1',
  chainId: 137,
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_3 = {
  orderHash: '0x3',
  offerer: 'riley.eth',
  encodedOrder: 'order3',
  signature: 'sig3',
  nonce: '2',
  chainId: 137,
  orderStatus: ORDER_STATUS.FILLED,
}

const MOCK_ORDER_4 = {
  orderHash: '0x4',
  offerer: 'hayden.eth',
  encodedOrder: 'order4',
  signature: 'sig4',
  nonce: '4',
  chainId: 1,
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_5 = {
  orderHash: '0x5',
  offerer: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
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

const ADDITIONAL_FIELDS_ORDER_5 = {
  ...MOCK_ORDER_5,
  filler: '0x1',
}

const mockedGetCurrentTime = jest.mocked(currentTimestampInSeconds)
const mockTime = (time: number) => {
  mockedGetCurrentTime.mockImplementation(() => time.toString())
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = LimitOrdersRepository.create(documentClient)

beforeAll(async () => {
  mockTime(1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1 as any)
  mockTime(2)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_2 as any)
  mockTime(3)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_3 as any)
})

afterAll(async () => {
  await deleteAllRepoEntries(ordersRepository)
})

describe('LimitOrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      mockTime(1)
      ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1 as any)
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
    expect((queryResult.orders[0] as any).filler_offerer_orderStatus).toEqual(
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
      orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      offerer: MOCK_ORDER_1.offerer,
    })
    expect(orders.orders).toEqual([])
  })

  it('should return orders for limit', async () => {
    await expect(ordersRepository.getOrders(2, {})).rejects.toThrow(
      'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]'
    )
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

  it('should successfully page through orders with chainId', async () => {
    let orders = await ordersRepository.getOrders(1, { chainId: 137 })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    orders = await ordersRepository.getOrders(2, { chainId: 137 }, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should successfully page through orders with chainId, orderStatus', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_5 as any)
    let orders = await ordersRepository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN, chainId: 1 })
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_5))
    orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN, chainId: 1 }, orders.cursor)
    expect(orders.orders.length).toEqual(1)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders.cursor).toEqual(undefined)
  })

  it('should throw an Error for cursor with the wrong index', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_5))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    await expect(() => ordersRepository.getOrders(0, { offerer: 'riley.eth' }, orders.cursor)).rejects.toThrow(
      Error('Invalid cursor.')
    )
  })

  it('should throw an Error for cursor with the wrong cursor', async () => {
    const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.orders.length).toEqual(2)
    expect(orders.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_5))
    expect(orders.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    await expect(() => ordersRepository.getOrders(0, { offerer: 'riley.eth' }, 'wrong_cursor')).rejects.toThrow(
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
    expect(queryResult.orders.length).toEqual(3)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[2]).toEqual(expect.objectContaining(MOCK_ORDER_5))
  })

  it('should return all orders for OPEN status and between 1,3 time ascending order', async () => {
    const queryResult = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'between(1,3)',
      desc: false,
    })
    expect(queryResult.orders.length).toEqual(3)
    expect(queryResult.orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_5))
    expect(queryResult.orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(queryResult.orders[2]).toEqual(expect.objectContaining(MOCK_ORDER_2))
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
    } as any)
    const nonce = await ordersRepository.getNonceByAddressAndChain('hayden.eth', MOCK_ORDER_1.chainId)
    expect(nonce).toEqual('4')
  })

  it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '2',
      orderHash: '0x4',
    } as any)
    // at this point, there are three orders in the DB, two with nonce 2
    const nonce = await ordersRepository.getNonceByAddressAndChain('hayden.eth', MOCK_ORDER_1.chainId)
    expect(nonce).toEqual('2')
  })

  it('should generate random nonce for new address', async () => {
    const res = await ordersRepository.getNonceByAddressAndChain('random.eth', 1)
    expect(res).not.toBeUndefined()
    expect(generateRandomNonce).toHaveBeenCalled()
  })

  it('should track nonce for the same address on different chains separately', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_2,
      nonce: '10',
    } as any)
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_2,
      chainId: 1,
      nonce: '20',
    } as any)
    const nonce = await ordersRepository.getNonceByAddressAndChain(MOCK_ORDER_2.offerer, MOCK_ORDER_2.chainId)
    expect(nonce).toEqual('10')
    const nonce2 = await ordersRepository.getNonceByAddressAndChain(MOCK_ORDER_2.offerer, 1)
    expect(nonce2).toEqual('20')
  })
})

describe('OrdersRepository get order count by offerer test', () => {
  it('should successfully return order count by existing offerer', async () => {
    mockTime(4)
    await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_4 as any)
    expect(await ordersRepository.countOrdersByOffererAndStatus(MOCK_ORDER_4.offerer, ORDER_STATUS.OPEN)).toEqual(3)
  })

  it('should return 0 for nonexistent offerer', async () => {
    expect(await ordersRepository.countOrdersByOffererAndStatus('nonexistent', ORDER_STATUS.OPEN)).toEqual(0)
  })
})

describe('OrdersRepository update status test', () => {
  it('should successfully update orderStatus of an order identified by orderHash', async () => {
    await ordersRepository.updateOrderStatus('0x1', ORDER_STATUS.FILLED, 'txHash', 1, [
      { tokenOut: '0x1', amountOut: '1' } as any,
    ])
    await expect(ordersRepository.getByHash('0x1')).resolves.toMatchObject({
      orderStatus: ORDER_STATUS.FILLED,
      offerer_orderStatus: `${MOCK_ORDER_1.offerer}_${ORDER_STATUS.FILLED}`,
      chainId_orderStatus: `${MOCK_ORDER_1.chainId}_${ORDER_STATUS.FILLED}`,
      chainId_orderStatus_filler: `${MOCK_ORDER_1.chainId}_${ORDER_STATUS.FILLED}_${(MOCK_ORDER_1 as any).filler}`,
      txHash: 'txHash',
      settledAmounts: [{ tokenOut: '0x1', amountOut: '1' }],
    })
  })

  it('should throw error if order does not exist', async () => {
    await expect(ordersRepository.updateOrderStatus('nonexistent', ORDER_STATUS.FILLED)).rejects.toEqual(
      new Error('cannot find order by hash when updating order status, hash: nonexistent')
    )
  })
})

describe('OrdersRepository delete test', () => {
  it('should delete orders by list of orderHashes', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '1',
    } as any)
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_2,
      nonce: '2',
    } as any)
    let order = await ordersRepository.getByHash(MOCK_ORDER_1.orderHash)
    expect(order).toBeDefined()
    order = await ordersRepository.getByHash(MOCK_ORDER_2.orderHash)
    expect(order).toBeDefined()
    await ordersRepository.deleteOrders([MOCK_ORDER_1.orderHash, MOCK_ORDER_2.orderHash])
    order = await ordersRepository.getByHash(MOCK_ORDER_1.orderHash)
    expect(order).not.toBeDefined()
    order = await ordersRepository.getByHash(MOCK_ORDER_2.orderHash)
    expect(order).not.toBeDefined()
  })
})
