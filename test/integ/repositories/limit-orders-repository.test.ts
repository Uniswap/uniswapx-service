import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ORDER_STATUS, SettledAmount, SORT_FIELDS } from '../../../lib/entities/Order'
import { MODEL_NAME } from '../../../lib/repositories/base'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { freezeClock, restoreClock } from '../../fakes/clock'
import { DYNAMO_LOCAL_CONFIG } from '../dynamo-local'
import { deleteAllRepoEntries, deleteOrdersByHash, findLeftoverRows } from './deleteAllRepoEntries'
import {
  CHAIN_A,
  CHAIN_B,
  CHAIN_C,
  createdAtTick,
  readAllPages,
  setClockToTick,
  storedItem,
  storeFixtures,
  tickMs,
} from './store-fixtures'

const SETTLED_AMOUNT: SettledAmount = { tokenOut: '0xtoken-out', amountOut: '1', tokenIn: '0xtoken-in', amountIn: '2' }

const documentClient = new DocumentClient(DYNAMO_LOCAL_CONFIG)
const ordersRepository = LimitOrdersRepository.create(documentClient)

beforeAll(() => {
  freezeClock(tickMs(0))
})

afterAll(() => {
  restoreClock()
})

describe('LimitOrders store', () => {
  const f = storeFixtures('limit')
  const { order1, order2, order3, order4, order5 } = f

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
    await deleteAllRepoEntries(ordersRepository, documentClient, TABLE_NAMES.LimitOrders, f.chainIds, f.offerers)
    expect(await findLeftoverRows(documentClient, TABLE_NAMES.LimitOrders, f.prefix)).toEqual([])
  })

  describe('LimitOrdersRepository put item test', () => {
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
        expect(await ordersRepository.getByHash(order.orderHash)).toEqual(storedItem(order, 1, MODEL_NAME.LIMIT))
        expect(await ordersRepository.getNonceByAddressAndChain(order.offerer, order.chainId)).toEqual('7')
      } finally {
        await deleteOrdersByHash(documentClient, TABLE_NAMES.LimitOrders, [order.orderHash])
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
