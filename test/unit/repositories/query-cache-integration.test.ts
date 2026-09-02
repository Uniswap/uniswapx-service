import { OrderType } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, SORT_FIELDS } from '../../../lib/entities'
import { GetOrdersQueryParams } from '../../../lib/handlers/get-orders/schema'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { CACHED_QUERY_PAGE_SIZE, MAX_ORDERS } from '../../../lib/repositories/generic-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { OrdersQueryCache, QueryCache } from '../../../lib/repositories/QueryCache'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { decode, encode } from '../../../lib/util/encryption'
import { metrics } from '../../../lib/util/metrics'

const TTL_MS = 500

describe('GenericOrdersRepository query caching', () => {
  const mockDocumentClient = mock<DocumentClient>()
  let now: number
  // Built per test rather than reaching for the exported singleton, whose TTL comes from
  // GET_ORDERS_CACHE_TTL_MS -- these assertions must not depend on the ambient environment.
  let cache: OrdersQueryCache

  const mockOrder = {
    orderHash: '0xhash',
    encodedOrder: '0xencoded',
    signature: '0xsig',
    orderStatus: ORDER_STATUS.OPEN,
    nonce: '1',
    offerer: '0xofferer',
    chainId: 1,
    chainId_orderStatus: '1_open',
    createdAt: 1,
    type: OrderType.Dutch_V2,
  }
  // Newest first, as DynamoDB returns them with ScanIndexForward=false.
  const v2Newest = { ...mockOrder, orderHash: '0xv2-newest', createdAt: 3, type: OrderType.Dutch_V2 }
  const priority = { ...mockOrder, orderHash: '0xpriority', createdAt: 2, type: OrderType.Priority }
  const v2Oldest = { ...mockOrder, orderHash: '0xv2-oldest', createdAt: 1, type: OrderType.Dutch_V2 }
  const page = [v2Newest, priority, v2Oldest]

  const mockQueryResponse = (items: unknown[] = [mockOrder], lastEvaluatedKey?: Record<string, unknown>) =>
    ({
      promise: () =>
        Promise.resolve({
          Items: items,
          Count: items.length,
          ...(lastEvaluatedKey && { LastEvaluatedKey: lastEvaluatedKey }),
        }),
    } as any)

  const lastQueryParams = () => mockDocumentClient.query.mock.calls[mockDocumentClient.query.mock.calls.length - 1][0]

  beforeEach(() => {
    jest.clearAllMocks()
    cache = new QueryCache(TTL_MS, 'GetOrdersQueryCache')
    now = 1_700_000_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('one fixed page per partition', () => {
    it('serves a repeated identical query from cache', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      const first = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      const second = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
      expect(second.orders).toEqual(first.orders)
    })

    it('reads the newest CACHED_QUERY_PAGE_SIZE rows regardless of the requested limit', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 10)

      expect(lastQueryParams()).toEqual(
        expect.objectContaining({ Limit: String(CACHED_QUERY_PAGE_SIZE), ScanIndexForward: false })
      )
    })

    it('shares one entry across different limits and slices in memory', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

      const two = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 2)
      const all = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
      expect(two.orders.map((o) => o.orderHash)).toEqual(['0xv2-newest', '0xpriority'])
      expect(all.orders).toHaveLength(3)
    })

    it('shares one entry across order-type filters and filters in memory', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))
      const filters: GetOrdersQueryParams = { chainId: 1, orderStatus: ORDER_STATUS.OPEN }

      const v2 = await repository.getOrdersFilteredByType(50, filters, [OrderType.Dutch_V2])
      const prio = await repository.getOrdersFilteredByType(50, filters, [OrderType.Priority])
      const either = await repository.getOrdersFilteredByType(50, filters, [OrderType.Dutch_V2, OrderType.Priority])

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
      // The read itself is unfiltered so every type shares it.
      expect(lastQueryParams()).not.toHaveProperty('FilterExpression')
      expect(v2.orders.map((o) => o.orderHash)).toEqual(['0xv2-newest', '0xv2-oldest'])
      expect(prio.orders.map((o) => o.orderHash)).toEqual(['0xpriority'])
      expect(either.orders).toHaveLength(3)
    })

    it('caps the returned page at MAX_ORDERS', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      const many = Array.from({ length: 80 }, (_, i) => ({ ...mockOrder, orderHash: `0x${i}`, createdAt: 80 - i }))
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(many))

      const result = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 0)

      expect(result.orders).toHaveLength(MAX_ORDERS)
    })

    it('does not share entries between different partition keys', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await repository.getByOrderStatus(ORDER_STATUS.EXPIRED, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
    })

    it('does not share entries between tables', async () => {
      const dutchRepository = DutchOrdersRepository.create(mockDocumentClient, cache)
      const limitRepository = LimitOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await dutchRepository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await limitRepository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
    })

    it('hands each caller its own array so a cached entry cannot be mutated', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      const first = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      first.orders.push({ ...mockOrder, orderHash: '0xinjected' } as any)

      const second = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
      expect(second.orders).toHaveLength(1)
    })
  })

  describe('TTL', () => {
    it('re-reads once the TTL has elapsed', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      now += TTL_MS
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
    })

    it('dates an entry from when the query finished, not when it started', async () => {
      // A throttled partition retries with backoff, so a query can outlast the TTL. Stamping
      // from the query start would store an already-expired entry and silently disable the
      // cache exactly under the load it exists to absorb.
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue({
        promise: async () => {
          now += TTL_MS + 50
          return { Items: [mockOrder], Count: 1 }
        },
      } as any)

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      mockDocumentClient.query.mockReturnValue(mockQueryResponse())
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
    })
  })

  describe('pagination from a cached page', () => {
    it('returns no cursor when the whole partition fit in the page', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

      const result = await repository.getOrders(50, { chainId: 1, orderStatus: ORDER_STATUS.OPEN })

      expect(result.cursor).toBeUndefined()
    })

    it('returns a cursor naming the last row handed back when more rows remain in the page', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

      const result = await repository.getOrders(2, { chainId: 1, orderStatus: ORDER_STATUS.OPEN })

      expect(result.orders.map((o) => o.orderHash)).toEqual(['0xv2-newest', '0xpriority'])
      // The exact key DynamoDB needs as ExclusiveStartKey on the chainId_orderStatus GSI.
      expect(JSON.parse(decode(result.cursor!))).toEqual({
        orderHash: '0xpriority',
        chainId_orderStatus: '1_open',
        createdAt: 2,
      })
    })

    it('returns a cursor when DynamoDB truncated the page, even if the whole slice was handed back', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      const lek = { orderHash: '0xv2-oldest', chainId_orderStatus: '1_open', createdAt: 1 }
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page, lek))

      const result = await repository.getOrders(50, { chainId: 1, orderStatus: ORDER_STATUS.OPEN })

      expect(result.orders).toHaveLength(3)
      expect(JSON.parse(decode(result.cursor!))).toEqual(lek)
    })

    it("falls back to DynamoDB's own key when the type filter matched nothing on a truncated page", async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      const lek = { orderHash: '0xpriority', chainId_orderStatus: '1_open', createdAt: 2 }
      mockDocumentClient.query.mockReturnValue(mockQueryResponse([priority], lek))

      const result = await repository.getOrdersFilteredByType(50, { chainId: 1, orderStatus: ORDER_STATUS.OPEN }, [
        OrderType.Dutch_V3,
      ])

      expect(result.orders).toEqual([])
      expect(JSON.parse(decode(result.cursor!))).toEqual(lek)
    })

    it('reads the next page from DynamoDB when a cursor is followed, bypassing the cache', async () => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

      const first = await repository.getOrders(2, { chainId: 1, orderStatus: ORDER_STATUS.OPEN })
      await repository.getOrders(2, { chainId: 1, orderStatus: ORDER_STATUS.OPEN }, first.cursor)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
      expect(lastQueryParams()).toEqual(
        expect.objectContaining({
          Limit: '2',
          ScanIndexForward: false,
          ExclusiveStartKey: { orderHash: '0xpriority', chainId_orderStatus: '1_open', createdAt: 2 },
        })
      )
      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheUncacheable', 1, expect.anything())
    })
  })

  describe('what is never cached', () => {
    // Partition keys built from caller-supplied free text: an unbounded key space that could
    // be sprayed to evict the hot entries, and per-caller traffic that rarely repeats anyway.
    it.each([
      ['filler', { filler: '0xfiller' }],
      ['chainId + filler', { chainId: 1, filler: '0xfiller' }],
      ['chainId + orderStatus + filler', { chainId: 1, orderStatus: ORDER_STATUS.OPEN, filler: '0xfiller' }],
      ['swapper', { offerer: '0xofferer' }],
      ['swapper + orderStatus', { offerer: '0xofferer', orderStatus: ORDER_STATUS.OPEN }],
      ['pair', { pair: '0xa-0xb-1' }],
    ])('does not cache a %s query and keeps the caller limit on the read', async (_name, filters) => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getOrders(10, filters as GetOrdersQueryParams)
      await repository.getOrders(10, filters as GetOrdersQueryParams)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
      expect(lastQueryParams()).toEqual(expect.objectContaining({ Limit: '10', ScanIndexForward: false }))
      expect(cache.size).toEqual(0)
      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheUncacheable', 1, expect.anything())
      expect(putMetric).not.toHaveBeenCalledWith('GetOrdersQueryCacheMiss', expect.anything(), expect.anything())
    })

    it('does not cache sort-key comparison queries', async () => {
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())
      const filters: GetOrdersQueryParams = {
        orderStatus: ORDER_STATUS.OPEN,
        sortKey: SORT_FIELDS.CREATED_AT,
        sort: 'gt(0)',
        desc: true,
      }

      await repository.getOrders(50, filters)
      await repository.getOrders(50, filters)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
      expect(cache.size).toEqual(0)
    })

    it('never involves the cache in orderHash lookups', async () => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.get.mockReturnValue({ promise: () => Promise.resolve({ Item: mockOrder }) } as any)

      await repository.getOrders(50, { orderHash: mockOrder.orderHash })
      await repository.getOrders(50, { orderHash: mockOrder.orderHash })

      expect(mockDocumentClient.get).toHaveBeenCalledTimes(2)
      expect(mockDocumentClient.query).not.toHaveBeenCalled()
      expect(cache.size).toEqual(0)
      expect(putMetric).not.toHaveBeenCalled()
    })

    it('does not cache when a repository is built without one, and still reads newest first', async () => {
      // Background jobs (unimind cron, reaper) write orders and re-read them immediately,
      // so they must never get a cached page.
      const repository = DutchOrdersRepository.create(mockDocumentClient)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
      expect(lastQueryParams()).toEqual(expect.objectContaining({ Limit: '50', ScanIndexForward: false }))
    })
  })

  describe('observability', () => {
    it('names hit/miss/size metrics after the cache instance', async () => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheMiss', 1, expect.anything())
      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheHit', 1, expect.anything())
      // Live distinct keys in this execution environment, reported on every cached read.
      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheSize', 1, expect.anything())
    })

    it('reports live entries dropped for capacity', async () => {
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const tiny: OrdersQueryCache = new QueryCache(TTL_MS, 'GetOrdersQueryCache', 1)
      const repository = DutchOrdersRepository.create(mockDocumentClient, tiny)
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      expect(putMetric).not.toHaveBeenCalledWith(
        'GetOrdersQueryCacheCapacityEviction',
        expect.anything(),
        expect.anything()
      )

      await repository.getByOrderStatus(ORDER_STATUS.EXPIRED, 50)
      expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheCapacityEviction', 1, expect.anything())
    })

    it('logs every miss with the partition it read', async () => {
      const info = jest.spyOn(Logger.prototype, 'info')
      const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
      const lek = { orderHash: '0xhash', orderStatus: 'open', createdAt: 1 }
      mockDocumentClient.query.mockReturnValue(mockQueryResponse([mockOrder], lek))

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      const missLogs = info.mock.calls.filter((call) => call[1] === 'Query cache miss')
      expect(missLogs).toHaveLength(1)
      expect(missLogs[0][0]).toEqual({
        table: TABLE_NAMES.Orders,
        index: 'orderStatus-createdAt-all',
        partitionKey: ORDER_STATUS.OPEN,
        rows: 1,
        truncated: true,
        cacheSize: 1,
      })
    })

    it('emits no cache metrics when the cache is disabled via the TTL=0 kill switch', async () => {
      // A disabled cache reporting a 100% miss rate would be indistinguishable from a broken
      // one on a dashboard, exactly during a rollback.
      const putMetric = jest.spyOn(metrics, 'putMetric')
      const repository = DutchOrdersRepository.create(mockDocumentClient, new QueryCache(0, 'GetOrdersQueryCache'))
      mockDocumentClient.query.mockReturnValue(mockQueryResponse())

      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
      await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

      expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
      expect(lastQueryParams()).toEqual(expect.objectContaining({ Limit: '50' }))
      expect(putMetric).not.toHaveBeenCalled()
    })
  })

  it('dedupes an order that two per-status sub-queries return under different statuses', async () => {
    // The per-status sub-queries are independent cache entries, so one can be a stale hit
    // while the other reads fresh; the merge must not surface the same order twice.
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    const openCopy = { ...mockOrder, orderStatus: ORDER_STATUS.OPEN }
    const expiredCopy = { ...mockOrder, orderStatus: ORDER_STATUS.EXPIRED }
    const other = { ...mockOrder, orderHash: '0xother', orderStatus: ORDER_STATUS.EXPIRED }
    mockDocumentClient.query
      .mockReturnValueOnce(mockQueryResponse([openCopy]))
      .mockReturnValueOnce(mockQueryResponse([expiredCopy, other]))

    const result = await repository.getOrders(50, {
      chainId: 1,
      orderStatus: [ORDER_STATUS.OPEN, ORDER_STATUS.EXPIRED],
    } as GetOrdersQueryParams)

    expect(result.orders).toHaveLength(2)
    // Transitions usually flow away from OPEN, so the non-OPEN copy wins the tiebreak.
    const deduped = result.orders.find((o) => o.orderHash === mockOrder.orderHash)
    expect(deduped?.orderStatus).toEqual(ORDER_STATUS.EXPIRED)
  })

  it('a cursor built from a cached page is accepted by the uncached path', async () => {
    // The synthetic key must pass the repository's own cursor validation for the index.
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse(page))

    const first = await repository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN })
    expect(JSON.parse(decode(first.cursor!))).toEqual({ orderHash: '0xv2-newest', orderStatus: 'open', createdAt: 3 })

    await expect(repository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN }, first.cursor)).resolves.toBeDefined()
    // ...and a cursor for a different index is still rejected.
    const wrongIndex = encode(JSON.stringify({ orderHash: '0xv2-newest', chainId: 1, createdAt: 3 }))
    await expect(repository.getOrders(1, { orderStatus: ORDER_STATUS.OPEN }, wrongIndex)).rejects.toThrow(
      'Invalid cursor.'
    )
  })
})
