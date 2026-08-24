import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { OrdersQueryCache } from '../../../lib/repositories/generic-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { QueryCache } from '../../../lib/repositories/QueryCache'

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
    cache = new QueryCache(TTL_MS)
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
