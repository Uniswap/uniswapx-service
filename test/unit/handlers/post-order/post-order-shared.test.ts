import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../../lib/entities'
import { ErrorCode } from '../../../../lib/handlers/base'
import {
  DEFAULT_MAX_OPEN_LIMIT_ORDERS,
  DEFAULT_MAX_OPEN_ORDERS,
  HIGH_MAX_OPEN_ORDERS,
  HIGH_MAX_OPEN_ORDERS_SWAPPERS,
} from '../../../../lib/handlers/constants'
import {
  DUTCH_AUCTION_ORDER_ROUTE,
  LIMIT_ORDER_ROUTE,
  PostOrderRoute,
} from '../../../../lib/handlers/post-order/routes'
import { HttpStatusCode } from '../../../../lib/HttpStatusCode'
import { log } from '../../../../lib/Logging'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { ChainId, SUPPORTED_CHAINS } from '../../../../lib/util/chain'
import { formatOrderEntity } from '../../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { freezeClock, restoreClock } from '../../../fakes/clock'
import { makePostOrderHandler, PostOrderHandlerHarness } from '../../builders/post-path'
import { EVENT_CONTEXT, QUOTE_ID, REQUEST_ID, SIGNATURE } from '../../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

jest.mock('../../../../lib/handlers/shared/sfn', () => ({ kickoffOrderTrackingSfn: jest.fn() }))

// A post of an order the route accepts, and the entity the route should write for it.
type RoutePost = { request: APIGatewayProxyEvent; entity: UniswapXOrderEntity }

type RouteCase = {
  // The describe title the route's own suite uses, so each case keeps its name.
  suite: string
  route: PostOrderRoute
  maxOpenOrders: number
  post: (swapper?: string) => RoutePost
}

const ROUTES: RouteCase[] = [
  {
    suite: 'Testing post order handler.',
    route: DUTCH_AUCTION_ORDER_ROUTE,
    maxOpenOrders: DEFAULT_MAX_OPEN_ORDERS,
    post: (swapper) => {
      const order = new DutchV2Order(
        SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, swapper ? { swapper } : {}),
        SIGNATURE,
        ChainId.MAINNET,
        undefined,
        undefined,
        undefined,
        undefined,
        QUOTE_ID,
        REQUEST_ID
      )
      return {
        request: PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          chainId: order.chainId,
          quoteId: QUOTE_ID,
          requestId: REQUEST_ID,
          orderType: OrderType.Dutch_V2,
        }),
        entity: order.toEntity(ORDER_STATUS.OPEN),
      }
    },
  },
  {
    suite: 'Testing post limit order handler.',
    route: LIMIT_ORDER_ROUTE,
    maxOpenOrders: DEFAULT_MAX_OPEN_LIMIT_ORDERS,
    post: (swapper) => {
      const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, swapper ? { swapper } : {})
      return {
        request: PostOrderRequestFactory.request({ encodedOrder: order.serialize() }),
        // TODO(andy.smith): This is a bug in UniswapXOrderService. https://linear.app/uniswap/issue/DAT-313/fix-order-type-for-limit-orders-in-database
        entity: formatOrderEntity(order, SIGNATURE, QUOTE_ID),
      }
    },
  },
]

const HIGH_LIST_SWAPPER = HIGH_MAX_OPEN_ORDERS_SWAPPERS[0]

describe.each(ROUTES)('$suite', ({ route, maxOpenOrders, post }) => {
  let harness: PostOrderHandlerHarness
  const handle = (event: APIGatewayProxyEvent) => harness.handler.handler(event, EVENT_CONTEXT)

  beforeAll(() => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({ 1: 'MOCK_SM_1' })
    process.env['ACCOUNT_ID'] = '123456789012'
    process.env['REGION'] = 'region'
    log.setLogLevel('SILENT')
  })

  beforeEach(() => {
    freezeClock(100)
    harness = makePostOrderHandler(route)
  })

  afterEach(() => {
    restoreClock()
  })

  describe('Test order submission blocking', () => {
    describe('Max open orders', () => {
      it('should reject order submission for offerer when too many open orders exist', async () => {
        harness.repository.openOrderCount = maxOpenOrders + 1

        expect(await handle(post().request)).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(harness.repository.countCalls).toHaveLength(1)
        expect(harness.onChainValidator.calls).toHaveLength(1)
        expect(harness.repository.puts).toEqual([])
      })

      it('should allow more orders if in the high list', async () => {
        // Above this route's default limit and within the high list's, so only the list lets it through.
        const openOrderCount = maxOpenOrders + 1
        expect(openOrderCount).toBeLessThanOrEqual(HIGH_MAX_OPEN_ORDERS)
        harness.repository.openOrderCount = openOrderCount

        expect(await handle(post().request)).toMatchObject({ statusCode: HttpStatusCode.Forbidden })
        expect(await handle(post(HIGH_LIST_SWAPPER).request)).toMatchObject({
          statusCode: HttpStatusCode.Created,
        })
        expect(harness.repository.countCalls).toHaveLength(2)
        expect(harness.repository.puts).toHaveLength(1)
        expect(harness.repository.puts[0].offerer).toEqual(HIGH_LIST_SWAPPER)
      })

      it('should reject order submission for offerer in high list at higher order count', async () => {
        harness.repository.openOrderCount = 201

        expect(await handle(post(HIGH_LIST_SWAPPER).request)).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(harness.repository.countCalls).toHaveLength(1)
        expect(harness.onChainValidator.calls).toHaveLength(1)
        expect(harness.repository.puts).toEqual([])
      })
    })

    it('should return 500 if DDB call throws', async () => {
      harness.repository.countError = new Error('DDB error')

      expect(await handle(post().request)).toMatchObject({
        statusCode: HttpStatusCode.InternalServerError,
      })
    })
  })

  describe('Testing invalid request validation.', () => {
    it.each([
      [
        { encodedOrder: '0xbad_order' },
        '{"detail":"\\"encodedOrder\\" with value \\"0xbad_order\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,4000}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { signature: '0xbad_signature' },
        '{"detail":"\\"signature\\" with value \\"0xbad_signature\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { chainId: 0 },
        `{"detail":"\\"chainId\\" must be one of [${SUPPORTED_CHAINS.join(', ')}]","errorCode":"VALIDATION_ERROR"}`,
      ],
      [{ quoteId: 'not_UUIDV4' }, '{"detail":"\\"quoteId\\" must be a valid GUID","errorCode":"VALIDATION_ERROR"}'],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = PostOrderRequestFactory.request({
        ...invalidBodyField,
      })
      const postOrderResponse = await handle(invalidEvent)
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
      expect(harness.orderValidator.calls).toEqual([])
      expect(harness.repository.puts).toEqual([])
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      harness.repository.putError = new Error('database unavailable')

      const { request, entity } = post()
      const postOrderResponse = await handle(request)
      expect(harness.repository.puts).toEqual([entity])
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ detail: 'database unavailable', errorCode: ErrorCode.InternalError, id: 'testRequest' }),
        statusCode: HttpStatusCode.InternalServerError,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('When validation fails', () => {
    it('off-chain validation failed; throws 400', async () => {
      const errorCode = ErrorCode.InvalidOrder
      const errorString = 'testing offchain validation'
      harness.orderValidator.result = { valid: false, errorString }

      const postOrderResponse = await handle(post().request)
      expect(harness.repository.puts).toEqual([])
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ detail: errorString, errorCode, id: 'testRequest' }),
        statusCode: HttpStatusCode.BadRequest,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('on-chain validation failed; throws 400', async () => {
      harness.onChainValidator.result = OrderValidation.ValidationFailed

      const postOrderResponse = await handle(post().request)
      expect(harness.repository.puts).toEqual([])
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({
          detail: `Onchain validation failed: ValidationFailed`,
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
        statusCode: HttpStatusCode.BadRequest,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })
})
