import { GetNonceHandler } from '../../../lib/handlers/get-nonce/handler'
import { GET_LIMIT_ORDERS_HANDLER_OPTIONS, GetOrdersHandler } from '../../../lib/handlers/get-orders/handler'
import { OrderReader, SINGLE_PAGE } from '../../../lib/handlers/get-orders/order-reader'
import { ProviderMap } from '../../../lib/handlers/shared'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import {
  GetLimitOrdersReads,
  GetNonceReads,
  GetOrdersReads,
  NEVER_SEEN_NONCE_PREFIX,
  NEVER_SEEN_SWAPPER,
  SeededRows,
} from './fixtures/read-orders'
import {
  deleteRawItems,
  documentClient,
  getEvent,
  httpResult,
  HttpResult,
  LAMBDA_CONTEXT,
  leftoverKeys,
  putRawItems,
  recordMetricScopes,
} from './harness'

const ORDER_ROWS = Object.values(SeededRows.Orders)
const LIMIT_ORDER_ROWS = Object.values(SeededRows.LimitOrders)
const orderKeys = (rows: { orderHash: string }[]) => rows.map(({ orderHash }) => ({ orderHash }))
const NONCE_KEYS = SeededRows.Nonces.map(({ offerer }) => ({ offerer }))

// Answers Permit2's nonceBitmap with an empty word, so the stored nonce is still unused onchain.
class EmptyBitmapProvider {
  readonly _isProvider = true
  public readonly calls: { to: string; data: string }[] = []

  async call(tx: { to: string; data: string }): Promise<string> {
    this.calls.push({ to: tx.to, data: tx.data })
    return `0x${'00'.repeat(32)}`
  }
}

// BatchGetItem returns items in no particular order, so a by-hashes body is compared sorted.
function sortedByHash(result: HttpResult): HttpResult {
  const body = result.body as { orders: { orderHash: string }[] }
  return {
    ...result,
    body: { ...body, orders: [...body.orders].sort((a, b) => a.orderHash.localeCompare(b.orderHash)) },
  }
}

describe('GET order contract', () => {
  const ordersRepository = DutchOrdersRepository.create(documentClient)
  const limitOrdersRepository = LimitOrdersRepository.create(documentClient)
  const provider = new EmptyBitmapProvider()

  const getOrders = new GetOrdersHandler(
    'getOrdersHandler',
    ordersRepository,
    new OrderReader(ordersRepository, limitOrdersRepository, SINGLE_PAGE)
  )
  const getLimitOrders = new GetOrdersHandler(
    'getLimitOrdersHandler',
    limitOrdersRepository,
    OrderReader.forLimitOrders(limitOrdersRepository),
    GET_LIMIT_ORDERS_HANDLER_OPTIONS
  )
  // An orders repository also reads nonces, so it stands in for the Nonces repository.
  const getNonce = new GetNonceHandler('getNonceHandler', ordersRepository, {
    get: () => provider,
  } as unknown as ProviderMap)

  beforeAll(async () => {
    await putRawItems(TABLE_NAMES.Orders, ORDER_ROWS)
    await putRawItems(TABLE_NAMES.LimitOrders, LIMIT_ORDER_ROWS)
    await putRawItems(TABLE_NAMES.Nonces, SeededRows.Nonces)
  })

  afterAll(async () => {
    await deleteRawItems(TABLE_NAMES.Orders, orderKeys(ORDER_ROWS))
    await deleteRawItems(TABLE_NAMES.LimitOrders, orderKeys(LIMIT_ORDER_ROWS))
    await deleteRawItems(TABLE_NAMES.Nonces, NONCE_KEYS)
    expect(await leftoverKeys(TABLE_NAMES.Orders, orderKeys(ORDER_ROWS))).toEqual([])
    expect(await leftoverKeys(TABLE_NAMES.LimitOrders, orderKeys(LIMIT_ORDER_ROWS))).toEqual([])
    expect(await leftoverKeys(TABLE_NAMES.Nonces, NONCE_KEYS)).toEqual([])
  })

  beforeEach(() => {
    recordMetricScopes()
    provider.calls.length = 0
  })

  it.each(Object.entries(GetOrdersReads))('GET /orders %s', async (name, { query, expected }) => {
    const result = httpResult(await getOrders.handler(getEvent(query), LAMBDA_CONTEXT))
    expect(name === 'byHashes' ? sortedByHash(result) : result).toEqual(expected)
  })

  it.each(Object.entries(GetLimitOrdersReads))('GET /limit-orders %s', async (_name, { query, expected }) => {
    expect(httpResult(await getLimitOrders.handler(getEvent(query), LAMBDA_CONTEXT))).toEqual(expected)
  })

  it.each(Object.entries(GetNonceReads))('GET /nonce %s', async (_name, { query, expected }) => {
    const result = httpResult(await getNonce.handler(getEvent(query), LAMBDA_CONTEXT))
    expect({ ...result, onchainNonceChecks: provider.calls }).toEqual(expected)
  })

  // Random by design: a word-aligned nonce under the UniswapX prefix, with no onchain check.
  it('GET /nonce hands a never-seen swapper a fresh random nonce', async () => {
    const result = httpResult(await getNonce.handler(getEvent({ address: NEVER_SEEN_SWAPPER }), LAMBDA_CONTEXT))
    expect(result).toEqual({ statusCode: 200, body: { nonce: expect.stringMatching(/^[0-9]+$/) } })
    const nonce = BigInt((result.body as { nonce: string }).nonce)
    expect(nonce >> BigInt(232)).toEqual(BigInt(NEVER_SEEN_NONCE_PREFIX))
    expect(nonce % BigInt(256)).toEqual(BigInt(0))
    expect(provider.calls).toEqual([])
  })
})
