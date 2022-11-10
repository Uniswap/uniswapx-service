import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SORT_FIELDS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'
import * as nonceUtil from '../../lib/util/nonce'
import { getCurrentMonth } from '../../lib/util/time'

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
  sellToken: 'weth',
}

const MOCK_ORDER_2 = {
  orderHash: '0x2',
  offerer: 'riley.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
  sellToken: 'uni',
}

const MOCK_ORDER_3 = {
  orderHash: '0x3',
  offerer: 'riley.eth',
  encodedOrder: 'order3',
  signature: 'sig3',
  nonce: '2',
  orderStatus: ORDER_STATUS.FILLED,
  sellToken: 'weth',
}

const ADDITIONAL_FIELDS_ORDER_1 = {
  ...MOCK_ORDER_1,
  createdAt: 1,
  deadline: 1,
  createdAtMonth: 1,
}

const ADDITIONAL_FIELDS_ORDER_2 = {
  ...MOCK_ORDER_2,
  createdAt: 2,
  deadline: 2,
  createdAtMonth: 1,
}

const ADDITIONAL_FIELDS_ORDER_3 = {
  ...MOCK_ORDER_3,
  createdAt: 3,
  deadline: 3,
  createdAtMonth: 1,
}

const mockedGetCurrentMonth = jest.mocked(getCurrentMonth)
mockedGetCurrentMonth.mockImplementation(() => 1)

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = new DynamoOrdersRepository()
DynamoOrdersRepository.initialize(documentClient)

beforeAll(async () => {
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_2)
  await ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_3)
})

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      ordersRepository.putOrderAndUpdateNonceTransaction(ADDITIONAL_FIELDS_ORDER_1)
    }).not.toThrow()
  })
})

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
    const orders = await ordersRepository.getOrders(10, { offerer: MOCK_ORDER_2.offerer })
    expect(orders.length).toEqual(2)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
    expect(orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_3))
  })

  it('should return no orders for offerer', async () => {
    const orders = await ordersRepository.getOrders(10, { offerer: 'zach.eth' })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.OPEN })
    expect(orders.length).toEqual(2)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.UNVERIFIED })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken', async () => {
    const orders = await ordersRepository.getOrders(10, { sellToken: MOCK_ORDER_1.sellToken })
    expect(orders.length).toEqual(2)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
    expect(orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_3))
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
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_1,
        offererOrderStatusSellToken: `${MOCK_ORDER_1.offerer}-${MOCK_ORDER_1.orderStatus}-${MOCK_ORDER_1.sellToken}`,
      })
    )
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
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_2,
        offererOrderStatus: `${MOCK_ORDER_2.offerer}-${MOCK_ORDER_2.orderStatus}`,
      })
    )
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
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_1,
        offererSellToken: `${MOCK_ORDER_1.offerer}-${MOCK_ORDER_1.sellToken}`,
      })
    )
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
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(
      expect.objectContaining({
        ...MOCK_ORDER_1,
        sellTokenOrderStatus: `${MOCK_ORDER_1.sellToken}-${MOCK_ORDER_1.orderStatus}`,
      })
    )
  })

  it('should return no orders for sellToken and orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: 'corn',
      orderStatus: ORDER_STATUS.UNVERIFIED,
    })
    expect(orders).toEqual([])
  })

  it('should return orders for limit', async () => {
    const orders = await ordersRepository.getOrders(2, {})
    expect(orders.length).toEqual(2)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_3))
    expect(orders[1]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })
})

describe('OrdersRepository getOrders test with sorting', () => {
  it('should successfully get order given an offerer and createdAt sort', async () => {
    const orders = await ordersRepository.getOrders(10, {
      offerer: MOCK_ORDER_2.offerer,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lte(2)',
    })
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no order given an offerer and createdAt sort', async () => {
    const orders = await ordersRepository.getOrders(10, {
      offerer: MOCK_ORDER_2.offerer,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lt(2)',
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given an orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.DEADLINE,
      sort: 'gte(2)',
    })
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return no orders for orderStatus', async () => {
    const orders = await ordersRepository.getOrders(10, {
      orderStatus: ORDER_STATUS.OPEN,
      sortKey: SORT_FIELDS.DEADLINE,
      sort: 'gt(2)',
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given a sellToken', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lt(3)',
    })
    expect(orders.length).toEqual(1)
    expect(orders[0]).toEqual(expect.objectContaining(MOCK_ORDER_1))
  })

  it('should return no orders for sellToken', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sellToken: MOCK_ORDER_1.sellToken,
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'lt(1)',
    })
    expect(orders).toEqual([])
  })

  it('should successfully get orders given only sort for createdAt', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: 'between(1,3)',
    })
    expect(orders.length).toEqual(3)
    expect(orders[0]?.orderHash).toEqual(MOCK_ORDER_1.orderHash)
    expect(orders[1]?.orderHash).toEqual(MOCK_ORDER_2.orderHash)
    expect(orders[2]?.orderHash).toEqual(MOCK_ORDER_3.orderHash)
  })

  it('should successfully get orders given only sort for deadline', async () => {
    const orders = await ordersRepository.getOrders(10, {
      sortKey: SORT_FIELDS.DEADLINE,
      sort: 'lt(3)',
    })
    expect(orders.length).toEqual(2)
    expect(orders[0]?.orderHash).toEqual(MOCK_ORDER_1.orderHash)
    expect(orders[1]?.orderHash).toEqual(MOCK_ORDER_2.orderHash)
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
