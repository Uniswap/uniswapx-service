import { OrderType } from '@uniswap/uniswapx-sdk'
import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { UniswapXOrderEntity } from '../../../../lib/entities'
import { GetDocsHandler } from '../../../../lib/handlers/get-docs/GetDocsHandler'
import { GetNonceHandler } from '../../../../lib/handlers/get-nonce/handler'
import { GetOrdersHandler } from '../../../../lib/handlers/get-orders/handler'
import { PostOrderHandler } from '../../../../lib/handlers/post-order/handler'
import { PostOrderBodyParser } from '../../../../lib/handlers/post-order/PostOrderBodyParser'
import { DUTCH_AUCTION_ORDER_ROUTE } from '../../../../lib/handlers/post-order/routes'
import { BaseOrdersRepository } from '../../../../lib/repositories/base'
import { OrderDispatcher } from '../../../../lib/services/OrderDispatcher'

// The request counters every API handler records once it has answered, on the request's own
// metrics logger, in the namespace and dimensions the request/4XX/5XX alarms and dashboards read.
// That includes requests rejected by validation, before the handler has done any work.

const NAMESPACE = 'Uniswap'
const DIMENSIONS = { Service: 'UniswapXService' }

type Recorded = { name: string; value: number; unit: unknown; namespace?: string; dimensions?: unknown }

// One request's metrics logger, recording each metric with the namespace and dimensions it was put under.
class RecordingMetricsLogger {
  public readonly recorded: Recorded[] = []
  private namespace?: string
  private dimensions?: unknown

  setNamespace(namespace: string): this {
    this.namespace = namespace
    return this
  }

  setDimensions(dimensions: unknown): this {
    this.dimensions = dimensions
    return this
  }

  putMetric(name: string, value: number, unit?: unknown): this {
    this.recorded.push({ name, value, unit, namespace: this.namespace, dimensions: this.dimensions })
    return this
  }
}

const byName = (recorded: Recorded[]) => [...recorded].sort((a, b) => a.name.localeCompare(b.name))

// The counters for one request, keyed by handler prefix, chain and status class, sorted by name.
function requestCounters(prefix: string, chainId: number, statusClass: string): Recorded[] {
  return byName(
    [
      `${prefix}ChainId${chainId}Status${statusClass}`,
      `${prefix}Request`,
      `${prefix}RequestChainId${chainId}`,
      `${prefix}Status${statusClass}`,
    ].map((name) => ({ name, value: 1, unit: 'Count', namespace: NAMESPACE, dimensions: DIMENSIONS }))
  )
}

const CONTEXT = { awsRequestId: 'request-metrics-test' } as unknown as Context
const ADDRESS = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'

function postEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    queryStringParameters: null,
  } as unknown as APIGatewayProxyEvent
}

function getEvent(queryStringParameters: Record<string, string>): APIGatewayProxyEvent {
  return { body: null, queryStringParameters } as unknown as APIGatewayProxyEvent
}

const VALID_POST_BODY = {
  encodedOrder: '0x00',
  signature: `0x${'1'.repeat(130)}`,
  chainId: 42161,
  orderType: OrderType.Dutch_V2,
}

describe('API request metrics', () => {
  let scopes: RecordingMetricsLogger[]

  beforeEach(() => {
    scopes = []
    jest.mocked(metricScope).mockImplementation(((handler: (metrics: MetricsLogger) => unknown) => {
      const scope = new RecordingMetricsLogger()
      scopes.push(scope)
      return handler(scope as unknown as MetricsLogger)
    }) as typeof metricScope)
  })

  // The one request's metrics, sorted by name; fails if the request did not get exactly one logger.
  function recordedByRequest(): Recorded[] {
    expect(scopes).toHaveLength(1)
    return byName(scopes[0].recorded)
  }

  describe('POST order', () => {
    const createOrder = jest.fn()
    const fromPostRequest = jest.fn(() => ({ orderType: OrderType.Dutch_V2 }))

    beforeEach(() => fromPostRequest.mockClear())

    function postHandler() {
      const handler = new PostOrderHandler(
        'post-order',
        { createOrder },
        { fromPostRequest } as unknown as PostOrderBodyParser,
        DUTCH_AUCTION_ORDER_ROUTE
      )
      return { handler }
    }

    it('counts a 2XX under the body chain', async () => {
      createOrder.mockResolvedValueOnce(`0x${'a'.repeat(64)}`)
      const { handler } = postHandler()
      const response = await handler.handler(postEvent(VALID_POST_BODY), CONTEXT)
      expect(response.statusCode).toEqual(201)
      expect(recordedByRequest()).toEqual(requestCounters('PostOrder', 42161, '2XX'))
    })

    it('counts a 5XX under the body chain', async () => {
      createOrder.mockRejectedValueOnce(new Error('store unavailable'))
      const { handler } = postHandler()
      const response = await handler.handler(postEvent(VALID_POST_BODY), CONTEXT)
      expect(response.statusCode).toEqual(500)
      expect(recordedByRequest()).toEqual(requestCounters('PostOrder', 42161, '5XX'))
    })

    it('counts a Joi 400, rejected before the handler parses the order, under the body chain', async () => {
      const { handler } = postHandler()
      const response = await handler.handler(postEvent({ ...VALID_POST_BODY, encodedOrder: undefined }), CONTEXT)
      expect(response.statusCode).toEqual(400)
      expect(fromPostRequest).not.toHaveBeenCalled()
      expect(recordedByRequest()).toEqual(requestCounters('PostOrder', 42161, '4XX'))
    })

    it('counts an invalid-JSON 422, rejected before the handler parses the order, under chain 0', async () => {
      const { handler } = postHandler()
      const response = await handler.handler(postEvent('{"chainId": 1,'), CONTEXT)
      expect(response.statusCode).toEqual(422)
      expect(fromPostRequest).not.toHaveBeenCalled()
      expect(recordedByRequest()).toEqual(requestCounters('PostOrder', 0, '4XX'))
    })

    it.each([
      ['an unsupported chain', 999],
      ['a non-numeric chain', 'mainnet'],
      ['a non-scalar chain', [1]],
    ])('counts %s under chain 0', async (_name, chainId) => {
      const { handler } = postHandler()
      const response = await handler.handler(postEvent({ ...VALID_POST_BODY, chainId }), CONTEXT)
      expect(response.statusCode).toEqual(400)
      expect(recordedByRequest()).toEqual(requestCounters('PostOrder', 0, '4XX'))
    })
  })

  describe('GET nonce', () => {
    const getNonceByAddressAndChain = jest.fn()

    beforeEach(() => getNonceByAddressAndChain.mockReset())

    function nonceHandler() {
      return { handler: new GetNonceHandler('get-nonce', { getNonceByAddressAndChain }, { get: jest.fn() }) }
    }

    it('counts a 2XX under the chainId query param, parsed from its string', async () => {
      getNonceByAddressAndChain.mockResolvedValueOnce(undefined)
      const response = await nonceHandler().handler.handler(getEvent({ address: ADDRESS, chainId: '1' }), CONTEXT)
      expect(response.statusCode).toEqual(200)
      expect(recordedByRequest()).toEqual(requestCounters('GetNonce', 1, '2XX'))
    })

    it('counts a 5XX under the chainId query param', async () => {
      getNonceByAddressAndChain.mockRejectedValueOnce(new Error('store unavailable'))
      const response = await nonceHandler().handler.handler(getEvent({ address: ADDRESS, chainId: '8453' }), CONTEXT)
      expect(response.statusCode).toEqual(500)
      expect(recordedByRequest()).toEqual(requestCounters('GetNonce', 8453, '5XX'))
    })

    it('counts a Joi 400, rejected before the nonce is read, under the chainId query param', async () => {
      const { handler } = nonceHandler()
      const response = await handler.handler(getEvent({ address: '0xbad_address', chainId: '42161' }), CONTEXT)
      expect(response.statusCode).toEqual(400)
      expect(getNonceByAddressAndChain).not.toHaveBeenCalled()
      expect(recordedByRequest()).toEqual(requestCounters('GetNonce', 42161, '4XX'))
    })

    // The handler serves chain 1 when the query names none, but the counters read only the query.
    it('counts a request without a chainId under chain 0', async () => {
      getNonceByAddressAndChain.mockResolvedValueOnce(undefined)
      const response = await nonceHandler().handler.handler(getEvent({ address: ADDRESS }), CONTEXT)
      expect(response.statusCode).toEqual(200)
      expect(recordedByRequest()).toEqual(requestCounters('GetNonce', 0, '2XX'))
    })

    it.each([
      ['an unsupported chain', '999'],
      ['an unparseable chain', 'abc'],
    ])('counts %s under chain 0', async (_name, chainId) => {
      const response = await nonceHandler().handler.handler(getEvent({ address: ADDRESS, chainId }), CONTEXT)
      expect(response.statusCode).toEqual(400)
      expect(recordedByRequest()).toEqual(requestCounters('GetNonce', 0, '4XX'))
    })
  })

  describe('GET orders', () => {
    const getOrders = jest.fn()

    beforeEach(() => getOrders.mockReset())

    function ordersHandler() {
      const repository = { getOrders } as unknown as BaseOrdersRepository<UniswapXOrderEntity>
      return { handler: new GetOrdersHandler('get-orders', repository, {} as OrderDispatcher) }
    }

    // The counters never read the query's chainId: every GET /orders request is chain 0.
    it('counts a 2XX under chain 0', async () => {
      getOrders.mockResolvedValueOnce({ orders: [] })
      const response = await ordersHandler().handler.handler(getEvent({ chainId: '1' }), CONTEXT)
      expect(response.statusCode).toEqual(200)
      expect(recordedByRequest()).toEqual(requestCounters('GetOrders', 0, '2XX'))
    })

    it('counts a 5XX under chain 0', async () => {
      getOrders.mockRejectedValueOnce(new Error('store unavailable'))
      const response = await ordersHandler().handler.handler(getEvent({ chainId: '1' }), CONTEXT)
      expect(response.statusCode).toEqual(500)
      expect(recordedByRequest()).toEqual(requestCounters('GetOrders', 0, '5XX'))
    })

    it('counts a Joi 400, rejected before the orders are read, under chain 0', async () => {
      const { handler } = ordersHandler()
      const response = await handler.handler(getEvent({ chainId: '1', swapper: ADDRESS }), CONTEXT)
      expect(response.statusCode).toEqual(400)
      expect(getOrders).not.toHaveBeenCalled()
      expect(recordedByRequest()).toEqual(requestCounters('GetOrders', 0, '4XX'))
    })
  })

  it('records nothing for a handler without request counters (docs)', async () => {
    const response = await new GetDocsHandler('get-docs').handler(getEvent({}), CONTEXT)
    expect(response.statusCode).toEqual(200)
    expect(recordedByRequest()).toEqual([])
  })
})
