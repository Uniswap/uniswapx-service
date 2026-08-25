import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { GetOrdersQueryParams } from '../../../lib/handlers/get-orders/schema'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { OrdersQueryCache, QueryCache } from '../../../lib/repositories/QueryCache'
import { metrics } from '../../../lib/util/metrics'

const TTL_MS = 250

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
    createdAt: 1,
  }

  const mockQueryResponse = (items: unknown[] = [mockOrder]) =>
    ({
      promise: () => Promise.resolve({ Items: items, Count: items.length }),
    } as any)

  beforeEach(() => {
    jest.clearAllMocks()
    cache = new QueryCache(TTL_MS, 'GetOrdersQueryCache')
    now = 1_700_000_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('serves a repeated identical query from cache', async () => {
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse())

    const first = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
    const second = await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

    expect(mockDocumentClient.query).toHaveBeenCalledTimes(1)
    expect(second.orders).toEqual(first.orders)
  })

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

  it('does not share entries between different partition keys', async () => {
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse())

    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
    await repository.getByOrderStatus(ORDER_STATUS.EXPIRED, 50)

    expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
  })

  it('does not share entries between different limits', async () => {
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse())

    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 10)
    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 20)

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

  it('names hit/miss metrics after the cache instance', async () => {
    const putMetric = jest.spyOn(metrics, 'putMetric')
    const repository = DutchOrdersRepository.create(mockDocumentClient, cache)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse())

    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

    expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheMiss', 1, expect.anything())
    expect(putMetric).toHaveBeenCalledWith('GetOrdersQueryCacheHit', 1, expect.anything())
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
    expect(putMetric).not.toHaveBeenCalled()
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

  it('does not cache when a repository is built without one', async () => {
    // Background jobs (unimind cron, reaper) write orders and re-read them immediately,
    // so they must never get a cached page.
    const repository = DutchOrdersRepository.create(mockDocumentClient)
    mockDocumentClient.query.mockReturnValue(mockQueryResponse())

    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)
    await repository.getByOrderStatus(ORDER_STATUS.OPEN, 50)

    expect(mockDocumentClient.query).toHaveBeenCalledTimes(2)
  })
})
