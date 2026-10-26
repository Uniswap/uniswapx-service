import { OrderType } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SettledAmount, SORT_FIELDS } from '../../../lib/entities/Order'
import { GetOrderTypeQueryParamEnum } from '../../../lib/handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { MODEL_NAME } from '../../../lib/repositories/base'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { QueryCache } from '../../../lib/repositories/QueryCache'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { freezeClock, restoreClock } from '../../fakes/clock'
import { QUOTE_ID, REQUEST_ID } from '../../unit/fixtures'
import { DYNAMO_LOCAL_CONFIG } from '../dynamo-local'
import { deleteAllRepoEntries, deleteOrdersByHash, findLeftoverRows } from './deleteAllRepoEntries'
import {
  CHAIN_A,
  CHAIN_B,
  CHAIN_C,
  createdAtTick,
  hashes,
  readAllPages,
  setClockToTick,
  storedItem,
  storeFixtures,
  tickMs,
} from './store-fixtures'

const SETTLED_AMOUNT: SettledAmount = { tokenOut: '0xtoken-out', amountOut: '1', tokenIn: '0xtoken-in', amountIn: '2' }

const documentClient = new DocumentClient(DYNAMO_LOCAL_CONFIG)

// The store cases every order table must pass. LimitOrders maps no requestId, so only the
// Orders rows carry one.
const TABLES = [
  {
    tableName: TABLE_NAMES.Orders,
    create: DutchOrdersRepository.create,
    entity: MODEL_NAME.DUTCH,
    scope: 'orders',
    rowExtras: { quoteId: QUOTE_ID, requestId: REQUEST_ID },
  },
  {
    tableName: TABLE_NAMES.LimitOrders,
    create: LimitOrdersRepository.create,
    entity: MODEL_NAME.LIMIT,
    scope: 'limit',
    rowExtras: {},
  },
]

beforeAll(() => {
  freezeClock(tickMs(0))
})

afterAll(() => {
  restoreClock()
})

describe.each(TABLES)('$tableName store', ({ tableName, create, entity, scope, rowExtras }) => {
  const ordersRepository = create(documentClient)
  const f = storeFixtures(scope, rowExtras)
  const { order1, order2, order3, order4, order5, order6 } = f

  beforeAll(async () => {
    setClockToTick(1)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order1)
    setClockToTick(2)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order2)
    setClockToTick(3)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order3)
    setClockToTick(1)
  })

  afterAll(async () => {
    await deleteAllRepoEntries(ordersRepository, documentClient, tableName, f.chainIds, f.offerers)
    expect(await findLeftoverRows(documentClient, tableName, f.prefix)).toEqual([])
  })

  describe('OrdersRepository put item test', () => {
    it('should successfully put an item in table', async () => {
      const order = f.row('put', {
        offerer: f.swapperA,
        nonce: '7',
        chainId: CHAIN_A,
        orderStatus: ORDER_STATUS.OPEN,
        filler: f.fillerA,
      })
      try {
        await ordersRepository.putOrderAndUpdateNonceTransaction(order)
        expect(await ordersRepository.getByHash(order.orderHash)).toEqual(storedItem(order, 1, entity))
        expect(await ordersRepository.getNonceByAddressAndChain(order.offerer, order.chainId)).toEqual('7')
      } finally {
        await deleteOrdersByHash(documentClient, tableName, [order.orderHash])
      }
    })
  })

  describe('OrdersRepository getOrders test', () => {
    it('should successfully get orders given an orderHash', async () => {
      const orders = await ordersRepository.getOrders(10, { orderHash: order2.orderHash })
      expect(orders.orders).toEqual([expect.objectContaining(order2)])
    })

    it('should return no orders for orderHash', async () => {
      const orders = await ordersRepository.getOrders(10, { orderHash: f.missingHash })
      expect(orders.orders).toEqual([])
    })

    it('should successfully get orders given orderHashes', async () => {
      const orders = await ordersRepository.getOrders(10, {
        orderHashes: [order2.orderHash, order3.orderHash],
      })
      // BatchGetItem returns items in no particular order.
      expect(orders.orders).toHaveLength(2)
      expect(orders.orders).toEqual(
        expect.arrayContaining([expect.objectContaining(order2), expect.objectContaining(order3)])
      )
    })

    it('should return no orders for orderHashes', async () => {
      const orders = await ordersRepository.getOrders(10, {
        orderHashes: [f.missingHash, f.otherMissingHash],
      })
      expect(orders.orders).toEqual([])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully get orders given an offerer', async () => {
      const queryResult = await ordersRepository.getOrders(10, { offerer: f.swapperB })
      expect(queryResult.orders).toEqual([expect.objectContaining(order3), expect.objectContaining(order2)])
    })

    it('should return no orders for offerer', async () => {
      const orders = await ordersRepository.getOrders(10, { offerer: f.unknownSwapper })
      expect(orders.orders).toEqual([])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully get orders given an orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.OPEN })
      expect(f.own(queryResult.orders)).toEqual([expect.objectContaining(order2), expect.objectContaining(order1)])
    })

    it('should return no orders for orderStatus', async () => {
      const orders = await ordersRepository.getOrders(10, { orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS })
      expect(f.own(orders.orders)).toEqual([])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully get orders given an chainId', async () => {
      const queryResult = await ordersRepository.getOrders(10, { chainId: CHAIN_B })
      expect(queryResult.orders).toEqual([expect.objectContaining(order3), expect.objectContaining(order2)])
    })

    it('should return no orders for chainId', async () => {
      const orders = await ordersRepository.getOrders(10, { chainId: CHAIN_C })
      expect(orders.orders).toEqual([])
    })

    it('should successfully get orders given an chainId and filler', async () => {
      const queryResult = await ordersRepository.getOrders(10, { chainId: CHAIN_B, filler: f.fillerA })
      expect(queryResult.orders).toEqual([expect.objectContaining(order2)])
    })

    it('should return no orders for chainId and filler', async () => {
      const orders = await ordersRepository.getOrders(10, { chainId: CHAIN_B, filler: f.unknownFiller })
      expect(orders.orders).toEqual([])
    })

    it('should successfully get orders given an chainId and orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, { chainId: CHAIN_A, orderStatus: ORDER_STATUS.OPEN })
      expect(queryResult.orders).toEqual([expect.objectContaining(order1)])
    })

    it('should return no orders for chainId and orderStatus', async () => {
      const orders = await ordersRepository.getOrders(10, { chainId: CHAIN_A, orderStatus: ORDER_STATUS.EXPIRED })
      expect(orders.orders).toEqual([])
    })

    it('should successfully get orders given an chainId, orderStatus, and filler', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        chainId: CHAIN_B,
        orderStatus: ORDER_STATUS.FILLED,
        filler: f.fillerB,
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order3)])
    })

    it('should return no orders for chainId and orderStatus', async () => {
      const orders = await ordersRepository.getOrders(10, {
        chainId: CHAIN_B,
        orderStatus: ORDER_STATUS.OPEN,
        filler: f.fillerB,
      })
      expect(orders.orders).toEqual([])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully get orders given a filler', async () => {
      const queryResult = await ordersRepository.getOrders(10, { filler: f.fillerA })
      expect(queryResult.orders).toEqual([expect.objectContaining(order2), expect.objectContaining(order1)])
    })

    it('should return no orders for filler', async () => {
      const queryResult = await ordersRepository.getOrders(10, { filler: f.unknownFiller })
      expect(queryResult.orders).toEqual([])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully get orders given a filler and orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerA,
        orderStatus: ORDER_STATUS.OPEN,
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order2), expect.objectContaining(order1)])
    })

    it('should return no orders for filler and orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerA,
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      })
      expect(queryResult.orders).toEqual([])
    })

    it('should successfully get orders given a filler and offerer', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerB,
        offerer: f.swapperB,
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order3)])
    })

    it('should return no orders for filler and offerer', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerC,
        offerer: f.swapperB,
      })
      expect(queryResult.orders).toEqual([])
    })

    it('should successfully get orders given a filler, offerer, orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerB,
        offerer: f.swapperB,
        orderStatus: ORDER_STATUS.FILLED,
      })
      expect(queryResult.orders).toEqual([
        expect.objectContaining({
          orderHash: order3.orderHash,
          filler_offerer_orderStatus: `${f.fillerB}_${f.swapperB}_${ORDER_STATUS.FILLED}`,
        }),
      ])
    })

    it('should return no orders for filler, offerer, orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        filler: f.fillerB,
        offerer: f.swapperB,
        orderStatus: ORDER_STATUS.OPEN,
      })
      expect(queryResult.orders).toEqual([])
    })

    it('should successfully get orders given an offerer and orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.OPEN,
        offerer: f.swapperB,
      })
      expect(queryResult.orders).toEqual([
        expect.objectContaining({
          ...order2,
          offerer_orderStatus: `${f.swapperB}_${ORDER_STATUS.OPEN}`,
        }),
      ])
    })

    it('should return no orders for offerer and orderStatus', async () => {
      const orders = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        offerer: f.swapperA,
      })
      expect(orders.orders).toEqual([])
    })

    it('should return orders for limit', async () => {
      await expect(ordersRepository.getOrders(2, {})).rejects.toThrow(
        'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]'
      )
    })

    it('should successfully get orders given an orderType', async () => {
      try {
        await ordersRepository.putOrderAndUpdateNonceTransaction(order6)
        const orders = await ordersRepository.getOrders(10, {
          chainId: CHAIN_C,
          orderType: GetOrderTypeQueryParamEnum.Dutch,
        })
        expect(orders.orders).toEqual([expect.objectContaining(order6)])
      } finally {
        await deleteOrdersByHash(documentClient, tableName, [order6.orderHash])
      }
    })

    it('should successfully get orders given chainId, order status, and empty cursor', async () => {
      try {
        await ordersRepository.putOrderAndUpdateNonceTransaction(order5)
        await ordersRepository.putOrderAndUpdateNonceTransaction(order6)
        const orders = await ordersRepository.getOrders(
          25,
          {
            chainId: CHAIN_C,
            orderStatus: ORDER_STATUS.OPEN,
          },
          undefined
        )
        expect(orders.orders).toEqual([expect.objectContaining(order6)])
      } finally {
        await deleteOrdersByHash(documentClient, tableName, [order6.orderHash, order5.orderHash])
      }
    })
  })

  describe('OrdersRepository getOrders test with pagination', () => {
    // Newest first: the repository returns createdAt descending by default.
    it('should successfully page through orders with offerer', async () => {
      let orders = await ordersRepository.getOrders(1, { offerer: f.swapperB })
      expect(orders.orders).toEqual([expect.objectContaining(order3)])
      orders = await ordersRepository.getOrders(2, { offerer: f.swapperB }, orders.cursor)
      expect(orders.orders).toEqual([expect.objectContaining(order2)])
      expect(orders.cursor).toEqual(undefined)
    })

    // Newest first: the repository returns createdAt descending by default. This suite's rows
    // are the newest in the shared status partition, so they fill the first page.
    it('should successfully page through orders with orderStatus', async () => {
      const first = await ordersRepository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN })
      expect(first.orders).toEqual([expect.objectContaining(order2)])
      expect(first.cursor).toBeDefined()
      const rest = await readAllPages(ordersRepository, 2, { orderStatus: ORDER_STATUS.OPEN }, first.cursor)
      expect(f.own(rest)).toEqual([expect.objectContaining(order1)])
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully page through orders with chainId', async () => {
      let orders = await ordersRepository.getOrders(1, { chainId: CHAIN_B })
      expect(orders.orders).toEqual([expect.objectContaining(order3)])
      orders = await ordersRepository.getOrders(2, { chainId: CHAIN_B }, orders.cursor)
      expect(orders.orders).toEqual([expect.objectContaining(order2)])
      expect(orders.cursor).toEqual(undefined)
    })

    // Newest first: the repository returns createdAt descending by default.
    it('should successfully page through orders with chainId, orderStatus', async () => {
      await ordersRepository.putOrderAndUpdateNonceTransaction(order5)
      const first = await ordersRepository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN, chainId: CHAIN_A })
      expect(first.orders).toHaveLength(1)
      expect(first.cursor).toBeDefined()
      const second = await ordersRepository.getOrders(
        2,
        { orderStatus: ORDER_STATUS.OPEN, chainId: CHAIN_A },
        first.cursor
      )
      expect(second.orders).toHaveLength(1)
      expect(second.cursor).toEqual(undefined)
      // The two rows share a createdAt, so the split between pages is not fixed; together they
      // must cover the partition exactly once.
      const paged = [...first.orders, ...second.orders]
      expect(paged).toContainEqual(expect.objectContaining(order5))
      expect(paged).toContainEqual(expect.objectContaining(order1))
    })

    it('should throw an Error for cursor with the wrong index', async () => {
      const orders = await ordersRepository.getOrders(2, { orderStatus: ORDER_STATUS.OPEN })
      expect(orders.orders).toHaveLength(2)
      expect(orders.cursor).toBeDefined()
      await expect(() => ordersRepository.getOrders(0, { offerer: f.swapperB }, orders.cursor)).rejects.toThrow(
        Error('Invalid cursor.')
      )
    })

    it('should throw an Error for cursor with the wrong cursor', async () => {
      await expect(() => ordersRepository.getOrders(0, { offerer: f.swapperB }, 'wrong_cursor')).rejects.toThrow(
        Error('Invalid cursor.')
      )
    })
  })

  describe('OrdersRepository getOrders test with sorting', () => {
    it('should successfully get order given an offerer and createdAt sort', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        offerer: f.swapperB,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `lte(${createdAtTick(2)})`,
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order2)])
    })

    it('should return no order given an offerer and createdAt sort', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        offerer: f.swapperB,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `lt(${createdAtTick(2)})`,
      })
      expect(queryResult.orders).toEqual([])
    })

    it('should successfully get orders given an orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.OPEN,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `gte(${createdAtTick(2)})`,
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order2)])
    })

    it('should return no orders for orderStatus', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `gt(${createdAtTick(2)})`,
      })
      expect(queryResult.orders).toEqual([])
    })

    // order1 and order5 share a createdAt, and DynamoDB does not order ties.
    it('should return all orders for OPEN status and between 1,3 time', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.OPEN,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `between(${createdAtTick(1)},${createdAtTick(3)})`,
        desc: true,
      })
      expect(queryResult.orders).toHaveLength(3)
      expect(queryResult.orders[0]).toEqual(expect.objectContaining(order2))
      expect(queryResult.orders.slice(1)).toEqual(
        expect.arrayContaining([expect.objectContaining(order1), expect.objectContaining(order5)])
      )
    })

    it('should return all orders for OPEN status and between 1,3 time ascending order', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: ORDER_STATUS.OPEN,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: `between(${createdAtTick(1)},${createdAtTick(3)})`,
        desc: false,
      })
      expect(queryResult.orders).toHaveLength(3)
      expect(queryResult.orders.slice(0, 2)).toEqual(
        expect.arrayContaining([expect.objectContaining(order1), expect.objectContaining(order5)])
      )
      expect(queryResult.orders[2]).toEqual(expect.objectContaining(order2))
    })
  })

  describe('OrdersRepository getByHash test', () => {
    it('should successfully get an item from table', async () => {
      const storedOrder1 = await ordersRepository.getByHash(order1.orderHash)
      // dynamodb-toolbox auto-generates 'created' and 'modified' fields
      expect(storedOrder1).toEqual(expect.objectContaining(order1))

      const storedOrder2 = await ordersRepository.getByHash(order2.orderHash)
      expect(storedOrder2).toEqual(expect.objectContaining(order2))
    })

    it('should return undefined if item does not exist', async () => {
      const res = await ordersRepository.getByHash(f.missingHash)
      expect(res).toBeUndefined()
    })
  })

  describe('OrdersRepository get nonce test', () => {
    const nonceOrder = (name: string, chainId: number, nonce: string) =>
      f.row(name, { offerer: f.nonceSwapper, nonce, chainId, orderStatus: ORDER_STATUS.OPEN })

    it('should successfully get last posted nonce from table', async () => {
      await ordersRepository.putOrderAndUpdateNonceTransaction(nonceOrder('nonce-1', CHAIN_A, '4'))
      const nonce = await ordersRepository.getNonceByAddressAndChain(f.nonceSwapper, CHAIN_A)
      expect(nonce).toEqual('4')
    })

    it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
      // The Nonces row holds the nonce written last, not the highest one.
      await ordersRepository.putOrderAndUpdateNonceTransaction(nonceOrder('nonce-2', CHAIN_A, '2'))
      const nonce = await ordersRepository.getNonceByAddressAndChain(f.nonceSwapper, CHAIN_A)
      expect(nonce).toEqual('2')
    })

    it('should return undefined for new address', async () => {
      const res = await ordersRepository.getNonceByAddressAndChain(f.unknownSwapper, CHAIN_A)
      expect(res).toBeUndefined()
    })

    it('should track nonce for the same address on different chains separately', async () => {
      await ordersRepository.putOrderAndUpdateNonceTransaction(nonceOrder('nonce-3', CHAIN_B, '10'))
      await ordersRepository.putOrderAndUpdateNonceTransaction(nonceOrder('nonce-4', CHAIN_A, '20'))
      const nonce = await ordersRepository.getNonceByAddressAndChain(f.nonceSwapper, CHAIN_B)
      expect(nonce).toEqual('10')
      const nonce2 = await ordersRepository.getNonceByAddressAndChain(f.nonceSwapper, CHAIN_A)
      expect(nonce2).toEqual('20')
    })
  })

  describe('OrdersRepository get order count by offerer test', () => {
    it('should successfully return order count by existing offerer', async () => {
      setClockToTick(4)
      await ordersRepository.putOrderAndUpdateNonceTransaction(order4)
      // order1, order5 (put by the pagination tests) and order4
      expect(await ordersRepository.countOrdersByOffererAndStatus(f.swapperA, ORDER_STATUS.OPEN)).toEqual(3)
    })

    it('should return 0 for nonexistent offerer', async () => {
      expect(await ordersRepository.countOrdersByOffererAndStatus(f.unknownSwapper, ORDER_STATUS.OPEN)).toEqual(0)
    })
  })

  describe('OrdersRepository update status test', () => {
    it('should successfully update orderStatus of an order identified by orderHash', async () => {
      await ordersRepository.updateOrderStatus(
        order1.orderHash,
        ORDER_STATUS.FILLED,
        'txHash',
        1,
        [SETTLED_AMOUNT],
        1_700_000_000
      )
      await expect(ordersRepository.getByHash(order1.orderHash)).resolves.toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
        offerer_orderStatus: `${f.swapperA}_${ORDER_STATUS.FILLED}`,
        filler_orderStatus: `${f.fillerA}_${ORDER_STATUS.FILLED}`,
        filler_offerer_orderStatus: `${f.fillerA}_${f.swapperA}_${ORDER_STATUS.FILLED}`,
        chainId_orderStatus: `${CHAIN_A}_${ORDER_STATUS.FILLED}`,
        chainId_orderStatus_filler: `${CHAIN_A}_${ORDER_STATUS.FILLED}_${f.fillerA}`,
        txHash: 'txHash',
        fillBlock: 1,
        fillTimestamp: 1_700_000_000,
        settledAmounts: [SETTLED_AMOUNT],
      })
    })

    it('should throw error if order does not exist', async () => {
      await expect(ordersRepository.updateOrderStatus(f.missingHash, ORDER_STATUS.FILLED)).rejects.toEqual(
        new Error(`cannot find order by hash when updating order status, hash: ${f.missingHash}`)
      )
    })
  })
})

// Cases that only apply to the Orders table, with rows of their own.
describe('Orders-only store cases', () => {
  const o = storeFixtures('dutch-only', { quoteId: QUOTE_ID, requestId: REQUEST_ID })
  const { order1, order2, order3, order5 } = o
  const PRIORITY_CHAIN_A = 8453
  const PRIORITY_CHAIN_B = 130
  const DUTCH_V3_CHAIN = 42161
  const ordersRepository = DutchOrdersRepository.create(documentClient)

  beforeAll(async () => {
    setClockToTick(1)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order1)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order5)
    setClockToTick(2)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order2)
    setClockToTick(3)
    await ordersRepository.putOrderAndUpdateNonceTransaction(order3)
    setClockToTick(1)
  })

  afterAll(async () => {
    await deleteAllRepoEntries(
      ordersRepository,
      documentClient,
      TABLE_NAMES.Orders,
      [...o.chainIds, PRIORITY_CHAIN_A, PRIORITY_CHAIN_B, DUTCH_V3_CHAIN],
      o.offerers
    )
    expect(await findLeftoverRows(documentClient, TABLE_NAMES.Orders, o.prefix)).toEqual([])
  })

  describe('OrdersRepository put item test', () => {
    it('should succesfully put a priority order in table', async () => {
      const priorityOrder1 = o.row('priority-1', {
        offerer: o.swapperA,
        nonce: '1',
        chainId: PRIORITY_CHAIN_A,
        orderStatus: ORDER_STATUS.OPEN,
        filler: o.fillerC,
        type: OrderType.Priority,
        auctionStartBlock: 100,
        baselinePriorityFeeWei: '0',
        cosignerData: { auctionTargetBlock: 95 },
        cosigner: '0xcosigner',
      })
      const priorityOrder2 = { ...priorityOrder1, chainId: PRIORITY_CHAIN_B, orderHash: `${o.prefix}priority-2` }

      await ordersRepository.putOrderAndUpdateNonceTransaction(priorityOrder1)
      await ordersRepository.putOrderAndUpdateNonceTransaction(priorityOrder2)

      for (const order of [priorityOrder1, priorityOrder2]) {
        expect(await ordersRepository.getByHash(order.orderHash)).toEqual(
          expect.objectContaining({ ...order, createdAt: createdAtTick(1) })
        )
        const byChain = await ordersRepository.getOrders(10, { chainId: order.chainId })
        expect(byChain.orders).toEqual([expect.objectContaining(order)])
      }
    })

    it('should successfully put a DutchV3 order in table', async () => {
      const dutchV3Order = o.row('dutch-v3', {
        offerer: o.swapperA,
        nonce: '1',
        chainId: DUTCH_V3_CHAIN,
        orderStatus: ORDER_STATUS.OPEN,
        type: OrderType.Dutch_V3,
        cosignerData: {
          decayStartBlock: 280615094,
          exclusiveFiller: '0x0000000000000000000000000000000000000000',
          inputOverride: '0',
          outputOverrides: ['0'],
        },
        startingBaseFee: '1234',
      })

      await ordersRepository.putOrderAndUpdateNonceTransaction(dutchV3Order)

      expect(await ordersRepository.getByHash(dutchV3Order.orderHash)).toEqual(
        expect.objectContaining({ ...dutchV3Order, createdAt: createdAtTick(1) })
      )
      const byChain = await ordersRepository.getOrders(10, { chainId: DUTCH_V3_CHAIN })
      expect(byChain.orders).toEqual([expect.objectContaining(dutchV3Order)])
    })
  })

  describe('OrdersRepository getOrders test', () => {
    it('should successfully get orders given multiple orderStatuses', async () => {
      const queryResult = await ordersRepository.getOrders(50, {
        orderStatus: [ORDER_STATUS.OPEN, ORDER_STATUS.FILLED],
      })
      // Should return both OPEN and FILLED orders
      const own = o.own(queryResult.orders)
      expect(own).toEqual(expect.arrayContaining([expect.objectContaining(order2), expect.objectContaining(order3)]))
      const statuses = new Set(own.map((order) => order.orderStatus))
      expect(statuses).toEqual(new Set([ORDER_STATUS.OPEN, ORDER_STATUS.FILLED]))
    })

    it('should return no orders for multiple orderStatuses that have no matches', async () => {
      const queryResult = await ordersRepository.getOrders(10, {
        orderStatus: [ORDER_STATUS.INSUFFICIENT_FUNDS, ORDER_STATUS.CANCELLED],
      })
      expect(o.own(queryResult.orders)).toEqual([])
    })

    it('should respect limit when querying multiple orderStatuses', async () => {
      const queryResult = await ordersRepository.getOrders(2, { orderStatus: [ORDER_STATUS.OPEN, ORDER_STATUS.FILLED] })
      expect(queryResult.orders).toHaveLength(2)
    })

    it('should return results sorted by createdAt descending for multiple statuses', async () => {
      const queryResult = await ordersRepository.getOrders(50, {
        orderStatus: [ORDER_STATUS.OPEN, ORDER_STATUS.FILLED],
      })
      expect(queryResult.orders.length).toBeGreaterThan(1)
      for (let i = 0; i < queryResult.orders.length - 1; i++) {
        expect(queryResult.orders[i].createdAt).toBeGreaterThanOrEqual(queryResult.orders[i + 1].createdAt!)
      }
    })

    it('should successfully get orders given chainId and multiple orderStatuses', async () => {
      const queryResult = await ordersRepository.getOrders(50, {
        chainId: CHAIN_B,
        orderStatus: [ORDER_STATUS.OPEN, ORDER_STATUS.FILLED],
      })
      expect(queryResult.orders).toEqual([expect.objectContaining(order3), expect.objectContaining(order2)])
    })
  })

  describe('OrdersRepository query cache with caller filters', () => {
    // filler/swapper filters on open orders are answered from the cached `open` page by
    // filtering in memory; the result must match what the caller's own GSI returns.
    const cachedRepository = DutchOrdersRepository.create(documentClient, new QueryCache(60_000, 'TestQueryCache'))

    it('matches the filler GSI for open orders', async () => {
      const expected = await ordersRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN, filler: o.fillerA })
      expect(expected.orders).toHaveLength(3)

      const fromCache = await cachedRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN, filler: o.fillerA })

      expect(hashes(fromCache.orders)).toEqual(hashes(expected.orders))
    })

    it('pages through a filler query from the cached page with a cursor DynamoDB accepts', async () => {
      const expected = await ordersRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN, filler: o.fillerA })

      const paged = await readAllPages(cachedRepository, 1, { orderStatus: ORDER_STATUS.OPEN, filler: o.fillerA })

      expect(hashes(paged)).toEqual(hashes(expected.orders))
    })
  })

  describe('OrdersRepository query cache pagination', () => {
    it('pages through a partition from a cached first page with the synthetic cursor', async () => {
      // The cached path builds the cursor from the last row it handed back rather than from
      // DynamoDB's LastEvaluatedKey; this proves DynamoDB accepts it as ExclusiveStartKey and
      // that following it covers the partition exactly once.
      const cachedRepository = DutchOrdersRepository.create(documentClient, new QueryCache(60_000, 'TestQueryCache'))
      const expected = o.own((await ordersRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN })).orders)
      expect(expected.length).toBeGreaterThanOrEqual(2)

      // DynamoDB hands back a continuation key when the limit lands exactly on the last row,
      // so the final page can legitimately be empty (the uncached path behaves the same).
      const paged = o.own(await readAllPages(cachedRepository, 1, { orderStatus: ORDER_STATUS.OPEN }))

      expect(hashes(paged).sort()).toEqual(hashes(expected).sort())
      // Newest first on both paths.
      expect(hashes(paged)).toEqual(hashes(expected))
    })
  })

  describe('OrdersRepository legacy millisecond timestamps', () => {
    const LEGACY_ORDER = o.row('legacy-ms', {
      offerer: o.swapperA,
      nonce: '99',
      chainId: CHAIN_A,
      orderStatus: ORDER_STATUS.OPEN,
    })

    it('keeps a legacy ms-createdAt order out of list reads on every path, but reachable by hash', async () => {
      // createdAt 1.6e12: 2020-09 in milliseconds, as 2023 V1 orders were stored
      jest.setSystemTime(1_600_000_000_000 * 1000)
      await ordersRepository.putOrderAndUpdateNonceTransaction(LEGACY_ORDER)
      setClockToTick(1)
      const cachedRepository = DutchOrdersRepository.create(documentClient, new QueryCache(60_000, 'TestQueryCache'))
      try {
        expect(await ordersRepository.getByHash(LEGACY_ORDER.orderHash)).toMatchObject({ createdAt: 1_600_000_000_000 })
        const uncached = await ordersRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN, chainId: CHAIN_A })
        const cached = await cachedRepository.getOrders(50, { orderStatus: ORDER_STATUS.OPEN, chainId: CHAIN_A })
        const byOfferer = await ordersRepository.getOrders(50, { offerer: LEGACY_ORDER.offerer })
        const byHash = await ordersRepository.getOrders(50, { orderHash: LEGACY_ORDER.orderHash })

        for (const result of [uncached, cached, byOfferer]) {
          expect(result.orders.length).toBeGreaterThan(0)
          expect(hashes(result.orders)).not.toContain(LEGACY_ORDER.orderHash)
        }
        expect(hashes(byHash.orders)).toEqual([LEGACY_ORDER.orderHash])
      } finally {
        await deleteOrdersByHash(documentClient, TABLE_NAMES.Orders, [LEGACY_ORDER.orderHash])
      }
    })
  })

  describe('OrdersRepository update status test', () => {
    it('should not downgrade a FILLED (terminal) order to another status', async () => {
      // Regression (PROTO-1201): a reaper run racing the check-order-status
      // state machine must not clobber a recorded fill with CANCELLED/EXPIRED.
      await ordersRepository.updateOrderStatus(
        order1.orderHash,
        ORDER_STATUS.FILLED,
        'txHash',
        1,
        [SETTLED_AMOUNT],
        1_700_000_000
      )

      // The downgrade is skipped (not thrown), so callers don't enter retry loops.
      await expect(
        ordersRepository.updateOrderStatus(order1.orderHash, ORDER_STATUS.CANCELLED)
      ).resolves.toBeUndefined()
      await expect(ordersRepository.updateOrderStatus(order1.orderHash, ORDER_STATUS.EXPIRED)).resolves.toBeUndefined()

      await expect(ordersRepository.getByHash(order1.orderHash)).resolves.toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
        offerer_orderStatus: `${o.swapperA}_${ORDER_STATUS.FILLED}`,
        chainId_orderStatus: `${CHAIN_A}_${ORDER_STATUS.FILLED}`,
        txHash: 'txHash',
        fillBlock: 1,
        fillTimestamp: 1_700_000_000,
        settledAmounts: [SETTLED_AMOUNT],
      })
    })

    it('should allow re-writing FILLED with updated fill details', async () => {
      await ordersRepository.updateOrderStatus(order1.orderHash, ORDER_STATUS.FILLED, 'txHash2', 2)
      await expect(ordersRepository.getByHash(order1.orderHash)).resolves.toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
        txHash: 'txHash2',
        fillBlock: 2,
      })
    })

    it('should allow non-terminal transitions and upgrades to FILLED', async () => {
      // e.g. INSUFFICIENT_FUNDS -> FILLED (the insufficient-funds reaper finding
      // a fill) must keep working.
      await ordersRepository.updateOrderStatus(order2.orderHash, ORDER_STATUS.INSUFFICIENT_FUNDS)
      await expect(ordersRepository.getByHash(order2.orderHash)).resolves.toMatchObject({
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      })
      await ordersRepository.updateOrderStatus(order2.orderHash, ORDER_STATUS.FILLED, 'txHash', 3)
      await expect(ordersRepository.getByHash(order2.orderHash)).resolves.toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
        txHash: 'txHash',
        fillBlock: 3,
      })
    })
  })
})
