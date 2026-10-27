import { Logger } from '@aws-lambda-powertools/logger'
import { getAddress } from '@ethersproject/address'
import { OrderValidation } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import { DUTCH_AUCTION_ORDER_ROUTE, LIMIT_ORDER_ROUTE } from '../../../lib/handlers/post-order/routes'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { setGlobalMetrics } from '../../../lib/util/metrics'
import { currentTimestampInSeconds } from '../../../lib/util/time'
import { RecordingAnalytics } from '../../fakes/analytics'
import { freezeClock, restoreClock } from '../../fakes/clock'
import { nowSeconds, TEST_STORE_CONTEXT } from '../../fakes/orders-repository'
import { makePostOrderHandler, PostOrderHandlerHarness } from '../../unit/builders/post-path'
import { orderRow } from '../repositories/store-fixtures'
import { NOW_SECONDS, Orders, Swappers } from './fixtures/orders'
import {
  AcceptedPosts,
  AcceptedWithCaveats,
  API_GATEWAY_HEADERS,
  MetricCall,
  OpenOrderLimit,
  PostRejections,
} from './fixtures/post-order'
import {
  deleteRawItems,
  documentClient,
  httpResult,
  LAMBDA_CONTEXT,
  leftoverKeys,
  postEvent,
  rawItem,
  RecordingMetricsLogger,
  RecordingWebhookProvider,
  recordMetricScopes,
  settle,
} from './harness'

jest.mock('../../../lib/handlers/shared/sfn', () => ({ kickoffOrderTrackingSfn: jest.fn() }))

type Lambda = PostOrderHandlerHarness<ReturnType<typeof DutchOrdersRepository.create>>

// DEFAULT_MAX_OPEN_ORDERS (5) open orders of the swapper the open-order limit cases post for.
const SEEDED_OPEN_ORDERS = [1, 2, 3, 4, 5].map((n) =>
  orderRow({
    orderHash: `0xcontract-open-${n}`,
    offerer: Swappers.atOpenOrderLimit.toLowerCase(),
    nonce: `${n}`,
    chainId: 1,
    orderStatus: ORDER_STATUS.OPEN,
  })
)

const ORDER_KEYS = [...Object.values(Orders), ...SEEDED_OPEN_ORDERS].map(({ orderHash }) => ({ orderHash }))
const NONCE_KEYS = [Swappers.poster, Swappers.atOpenOrderLimit].flatMap((swapper) =>
  [1, 8453, 42161].map((chainId) => ({ offerer: `${swapper.toLowerCase()}-${chainId}` }))
)

async function deleteSuiteRows(): Promise<void> {
  await deleteRawItems(TABLE_NAMES.Orders, ORDER_KEYS)
  await deleteRawItems(TABLE_NAMES.LimitOrders, ORDER_KEYS)
  await deleteRawItems(TABLE_NAMES.Nonces, NONCE_KEYS)
}

// The Lambda serving `route` as deployed, on DynamoDB Local. Both get a webhook provider; only
// the Dutch route's policy sends the immediate exclusive-filler notice.
function postLambda(route: string, webhookProvider: RecordingWebhookProvider): Lambda {
  if (route === LIMIT_ORDER_ROUTE.path) {
    return makePostOrderHandler(LIMIT_ORDER_ROUTE, {
      repository: LimitOrdersRepository.create(documentClient),
      webhookProvider,
    })
  }
  return makePostOrderHandler(DUTCH_AUCTION_ORDER_ROUTE, {
    repository: DutchOrdersRepository.create(documentClient),
    webhookProvider,
  })
}

// What the analytics logger receives for each posted order: the entity the service handed to
// analytics, run through the production AnalyticsService.
function postedOrderAnalytics(analytics: RecordingAnalytics): unknown[] {
  const logger = { info: jest.fn() }
  const service = new AnalyticsService(logger as unknown as Logger, currentTimestampInSeconds, getAddress)
  analytics.posted.forEach(({ order, orderType }) => service.logOrderPosted(order, orderType))
  return logger.info.mock.calls
}

function expectContract(actual: unknown, expected: unknown) {
  expect(actual).toEqual(withSortedMetrics(expected))
}

// Fixtures list metrics in any order; the recording logger reports them sorted by name.
function withSortedMetrics(expected: unknown): unknown {
  const sorted = (calls: MetricCall[]) => [...calls].sort(([a], [b]) => a.localeCompare(b))
  const { metrics, metricsOnPreviousRequestLogger, ...rest } = expected as {
    metrics?: MetricCall[]
    metricsOnPreviousRequestLogger?: MetricCall[]
  }
  return {
    ...rest,
    ...(metrics && { metrics: sorted(metrics) }),
    ...(metricsOnPreviousRequestLogger && { metricsOnPreviousRequestLogger: sorted(metricsOnPreviousRequestLogger) }),
  }
}

describe('POST order contract', () => {
  let scopes: RecordingMetricsLogger[]
  let webhookProvider: RecordingWebhookProvider

  beforeAll(async () => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({
      1: 'tracker-1',
      8453: 'tracker-8453',
      42161: 'tracker-42161',
    })
    process.env['REGION'] = 'us-east-2'
    process.env['ACCOUNT_ID'] = '123456789012'
    process.env['KMS_KEY_ID'] = 'contract-test-key'
    freezeClock(NOW_SECONDS * 1000)
    await deleteSuiteRows()
  })

  afterAll(async () => {
    restoreClock()
    expect(await leftoverKeys(TABLE_NAMES.Orders, ORDER_KEYS)).toEqual([])
    expect(await leftoverKeys(TABLE_NAMES.LimitOrders, ORDER_KEYS)).toEqual([])
    expect(await leftoverKeys(TABLE_NAMES.Nonces, NONCE_KEYS)).toEqual([])
  })

  beforeEach(() => {
    scopes = recordMetricScopes()
    webhookProvider = new RecordingWebhookProvider()
  })

  afterEach(async () => {
    webhookProvider.restore()
    await deleteSuiteRows()
  })

  // Everything an accepted post leaves behind.
  async function postAndObserve(lambda: Lambda, request: unknown, table: string) {
    const response = await lambda.handler.handler(postEvent(request), LAMBDA_CONTEXT)
    await settle()
    const { encodedOrder, chainId } = request as { encodedOrder: string; chainId: number }
    const order = Object.values(Orders).find((o) => o.encodedOrder === encodedOrder)
    if (!order) {
      throw new Error('the request does not post one of the fixture orders')
    }
    return {
      response: httpResult(response),
      storedRow: await rawItem(table as TABLE_NAMES, { orderHash: order.orderHash }),
      nonceRow: await rawItem(TABLE_NAMES.Nonces, { offerer: `${Swappers.poster.toLowerCase()}-${chainId}` }),
      startTracking: lambda.tracking.calls,
      postedOrderAnalytics: postedOrderAnalytics(lambda.analytics),
      exclusiveFillerNotices: webhookProvider.notices,
      cosignedDigests: lambda.cosigner.digests,
      metrics: scopes[0].sorted(),
    }
  }

  it.each(Object.entries(AcceptedPosts))('accepts %s', async (_name, { route, request, table, expected }) => {
    const lambda = postLambda(route, webhookProvider)
    expectContract(await postAndObserve(lambda, request, table), expected)
  })

  it('returns API Gateway headers on every response', async () => {
    const { route, request } = AcceptedPosts.Dutch_V2
    const response = await postLambda(route, webhookProvider).handler.handler(postEvent(request), LAMBDA_CONTEXT)
    expect(response.headers).toEqual(API_GATEWAY_HEADERS)
  })

  describe('accepted with caveats', () => {
    it('accepts a limit order posted without an orderType', async () => {
      const { route, request, expected } = AcceptedWithCaveats.untypedLimit
      const lambda = postLambda(route, webhookProvider)
      expectContract(await postAndObserve(lambda, request, 'LimitOrders'), expected)
    })

    it('accepts a priority order the order quoter calls not fillable yet', async () => {
      const { route, request, expected } = AcceptedWithCaveats.priorityNotFillableYet
      const lambda = postLambda(route, webhookProvider)
      lambda.onChainValidator.result = OrderValidation.OrderNotFillableYet
      const { response, storedRow, metrics } = await postAndObserve(lambda, request, 'Orders')
      expectContract({ response, stored: storedRow !== undefined, metrics }, expected)
    })

    it('accepts the order when starting its tracker fails after the write', async () => {
      const { route, request, expected } = AcceptedWithCaveats.trackerStartFails
      const lambda = postLambda(route, webhookProvider)
      lambda.tracking.failNextWith(new Error('state machine unavailable'))
      const { response, storedRow, metrics } = await postAndObserve(lambda, request, 'Orders')
      expectContract({ response, stored: storedRow !== undefined, metrics }, expected)
    })
  })

  describe('rejections', () => {
    const SETUP: Partial<Record<keyof typeof PostRejections, (lambda: Lambda) => void>> = {
      offchainValidationFailure: (lambda) => {
        lambda.orderValidator.result = { valid: false, errorString: 'testing offchain validation' }
      },
      priorityOffchainInvalidWithLowStart: (lambda) => {
        lambda.orderValidator.result = { valid: false, errorString: 'testing offchain validation' }
      },
      onchainValidationFailure: (lambda) => {
        lambda.onChainValidator.result = OrderValidation.ValidationFailed
      },
    }

    it.each(Object.entries(PostRejections))('rejects %s', async (name, { route, request, expected }) => {
      const lambda = postLambda(route, webhookProvider)
      SETUP[name as keyof typeof PostRejections]?.(lambda)
      // The metrics logger a previous request on this Lambda instance left installed globally.
      const previousRequestMetrics = new RecordingMetricsLogger()
      setGlobalMetrics(previousRequestMetrics)

      const response = await lambda.handler.handler(postEvent(request), LAMBDA_CONTEXT)
      await settle()

      expectContract(
        {
          response: httpResult(response),
          metrics: scopes[0].sorted(),
          metricsOnPreviousRequestLogger: previousRequestMetrics.sorted(),
        },
        expected
      )
      expect(lambda.tracking.calls).toEqual([])
      expect(lambda.analytics.posted).toEqual([])
      expect(await leftoverKeys(TABLE_NAMES.Orders, ORDER_KEYS)).toEqual([])
      expect(await leftoverKeys(TABLE_NAMES.LimitOrders, ORDER_KEYS)).toEqual([])
    })
  })

  describe('open-order limit', () => {
    beforeEach(async () => {
      const repository = DutchOrdersRepository.create(documentClient)
      for (const order of SEEDED_OPEN_ORDERS) {
        await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, order, nowSeconds())
      }
    })

    // `orderCount > max` (UniswapXOrderService): exactly max open orders still admits one more,
    // so a swapper can hold max + 1. Deliberate, for parity.
    it('admits a post at exactly the limit and rejects the next one', async () => {
      const lambda = postLambda(DUTCH_AUCTION_ORDER_ROUTE.path, webhookProvider)
      const first = await lambda.handler.handler(postEvent(OpenOrderLimit.request), LAMBDA_CONTEXT)
      const second = await lambda.handler.handler(postEvent(OpenOrderLimit.request), LAMBDA_CONTEXT)
      await settle()
      expectContract({ response: httpResult(first), metrics: scopes[0].sorted() }, OpenOrderLimit.atLimit)
      expectContract({ response: httpResult(second), metrics: scopes[1].sorted() }, OpenOrderLimit.overLimit)
    })
  })
})
