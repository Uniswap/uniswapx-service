import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { utils } from 'ethers'
import { mock } from 'jest-mock-extended'
import { toOrderEntity } from '../../../../lib/core/orders/storedRow'
import { UniswapXOrderEntity } from '../../../../lib/entities'
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
import { RpcSwapperSignatureProbe } from '../../../../lib/util/SwapperSignatureProbe'
import { dutchOrderEntity } from '../../../factories/order-entities'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { freezeClock, restoreClock } from '../../../fakes/clock'
import { FakeJsonRpcNode, REVERT_WITHOUT_DATA, RpcAnswer } from '../../../fakes/json-rpc-node'
import { makePostOrderHandler, PostOrderHandlerHarness } from '../../builders/post-path'
import { EVENT_CONTEXT, QUOTE_ID, REQUEST_ID, SIGNATURE } from '../../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

// A post of an order the route accepts, and the entity the route should write for it.
type RoutePost = { request: APIGatewayProxyEvent; entity: UniswapXOrderEntity }

type RouteCase = {
  // The describe title the route's own suite uses, so each case keeps its name.
  suite: string
  route: PostOrderRoute
  maxOpenOrders: number
  // The order type the route's posts parse to.
  orderType: OrderType
  post: (swapper?: string) => RoutePost
}

const ROUTES: RouteCase[] = [
  {
    suite: 'Testing post order handler.',
    route: DUTCH_AUCTION_ORDER_ROUTE,
    maxOpenOrders: DEFAULT_MAX_OPEN_ORDERS,
    orderType: OrderType.Dutch_V2,
    post: (swapper) => {
      const order = new DutchV2Order(
        SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, swapper ? { swapper } : {}),
        SIGNATURE,
        ChainId.MAINNET,
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
        entity: toOrderEntity(order),
      }
    },
  },
  {
    suite: 'Testing post limit order handler.',
    route: LIMIT_ORDER_ROUTE,
    maxOpenOrders: DEFAULT_MAX_OPEN_LIMIT_ORDERS,
    orderType: OrderType.Limit,
    post: (swapper) => {
      const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, swapper ? { swapper } : {})
      return {
        request: PostOrderRequestFactory.request({ encodedOrder: order.serialize() }),
        // TODO(andy.smith): This is a bug in OrderPoster. https://linear.app/uniswap/issue/DAT-313/fix-order-type-for-limit-orders-in-database
        entity: dutchOrderEntity(order, SIGNATURE, QUOTE_ID),
      }
    },
  },
]

const HIGH_LIST_SWAPPER = HIGH_MAX_OPEN_ORDERS_SWAPPERS[0]

describe.each(ROUTES)('$suite', ({ route, maxOpenOrders, orderType, post }) => {
  let harness: PostOrderHandlerHarness
  const handle = (event: APIGatewayProxyEvent) => harness.handler.handler(event, EVENT_CONTEXT)

  beforeAll(() => {
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

      it("should accept an order at exactly this route's open-order limit", async () => {
        harness.repository.openOrderCount = maxOpenOrders

        expect(await handle(post().request)).toMatchObject({ statusCode: HttpStatusCode.Created })
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
        body: JSON.stringify({ detail: 'Unexpected error', errorCode: ErrorCode.InternalError, id: 'testRequest' }),
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

    describe('an on-chain error the SDK does not map', () => {
      // An EIP-7702 swapper: its code is 0xef0100 then the address it delegates to.
      const DELEGATE = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
      const DELEGATED_CODE = `0xef0100${DELEGATE.slice(2).toLowerCase()}`
      // isValidSignature's return when the swapper accepts: the bytes4 0x1626ba7e, ABI-encoded.
      const MAGIC_RETURN = `0x1626ba7e${'00'.repeat(28)}`
      // For calls left hanging; every other probe gets the production deadline.
      const SHORT_PROBE_TIMEOUT_MS = 300
      let node: FakeJsonRpcNode
      let requestLoggers: ReturnType<typeof mock<Logger>>[]
      let createChild: jest.SpyInstance

      // The order quoter reverts with `revertData`, as an SDK reporting raw revert data answers.
      const useNode = (probeTimeoutMs?: number) => {
        harness = makePostOrderHandler(route, {
          swapperSignatureProbe: new RpcSwapperSignatureProbe({ get: () => node.provider() }, probeTimeoutMs),
        })
      }
      const quoteReverts = (revertData: string) => {
        harness.onChainValidator.result = OrderValidation.UnknownError
        harness.onChainValidator.revertData = revertData
      }
      const expectAnswer = (response: { statusCode: number; body: string }, detail: string) => {
        expect(response.statusCode).toBe(HttpStatusCode.BadRequest)
        expect(JSON.parse(response.body)).toEqual({ detail, errorCode: ErrorCode.InvalidOrder, id: 'testRequest' })
        expect(harness.repository.puts).toEqual([])
      }
      const expectWarned = (entity: UniswapXOrderEntity, fields: Record<string, unknown>) => {
        // The request's own logger: every line it writes carries the Lambda request id.
        expect(requestLoggers).toHaveLength(1)
        expect(requestLoggers[0].warn).toHaveBeenCalledWith('onchain validation failed: UnknownError', {
          chainId: entity.chainId,
          orderHash: entity.orderHash,
          swapper: expect.stringMatching(new RegExp(`^${entity.offerer}$`, 'i')),
          orderType,
          revertSelector: undefined,
          swapperHasCode: undefined,
          delegate: undefined,
          ...fields,
        })
        expect(JSON.stringify(requestLoggers[0].warn.mock.calls)).not.toContain(SIGNATURE.slice(2))
      }

      beforeEach(async () => {
        node = new FakeJsonRpcNode(ChainId.MAINNET)
        await node.start()
        useNode()
        requestLoggers = []
        createChild = jest.spyOn(log, 'createChild').mockImplementation((options) => {
          const logger = mock<Logger>()
          if (JSON.stringify(options) === JSON.stringify({ persistentLogAttributes: { requestId: 'testRequest' } })) {
            requestLoggers.push(logger)
          }
          return logger
        })
      })

      afterEach(async () => {
        createChild.mockRestore()
        await node.stop()
      })

      it('is logged on the request logger and answered 400 with its revert selector, with no probe', async () => {
        // Permit2's InvalidContractSignature() revert data.
        quoteReverts(utils.id('InvalidContractSignature()').slice(0, 10))
        const { request, entity } = post()

        expectAnswer(await handle(request), 'Onchain validation failed: UnknownError (revert 0xb0669cbc)')
        expectWarned(entity, { revertSelector: '0xb0669cbc', erc1271Result: 'not_checked' })
        expect(node.methods).toEqual([])
      })

      it('makes no probe when the SDK reports no revert data', async () => {
        harness.onChainValidator.result = OrderValidation.UnknownError
        const { request, entity } = post()

        expectAnswer(await handle(request), 'Onchain validation failed: UnknownError')
        expectWarned(entity, { erc1271Result: 'not_checked' })
        expect(node.methods).toEqual([])
      })

      it('makes no probe for an order the quoter accepts or rejects for a known reason', async () => {
        expect(await handle(post().request)).toMatchObject({ statusCode: HttpStatusCode.Created })
        harness.onChainValidator.result = OrderValidation.InsufficientFunds
        const rejected = await handle(post().request)
        expect(rejected.statusCode).toBe(HttpStatusCode.BadRequest)
        expect(JSON.parse(rejected.body).detail).toBe('Onchain validation failed: InsufficientFunds')

        expect(node.methods).toEqual([])
      })

      describe('when the quote reverted without data', () => {
        beforeEach(() => quoteReverts('0x'))

        it.each<[string, string, RpcAnswer]>([
          ['returns nothing', 'empty', { result: '0x' }],
          ['reverts', 'reverted', REVERT_WITHOUT_DATA],
        ])(
          'answers 400 InvalidSignature when the swapper with code %s on isValidSignature (%s)',
          async (_, erc1271Result, answer) => {
            node.getCode = { result: DELEGATED_CODE }
            node.ethCall = answer
            const { request, entity } = post()

            expectAnswer(await handle(request), 'Onchain validation failed: InvalidSignature')
            expectWarned(entity, { swapperHasCode: true, delegate: DELEGATE, erc1271Result })
            expect(node.methods).toEqual(['eth_getCode', 'eth_call'])
            expect(node.ethCalls[0].to?.toLowerCase()).toEqual(entity.offerer.toLowerCase())
          }
        )

        it('keeps UnknownError when the swapper with code accepts the signature', async () => {
          node.getCode = { result: DELEGATED_CODE }
          node.ethCall = { result: MAGIC_RETURN }
          const { request, entity } = post()

          expectAnswer(await handle(request), 'Onchain validation failed: UnknownError')
          expectWarned(entity, { swapperHasCode: true, delegate: DELEGATE, erc1271Result: 'magic' })
        })

        it('keeps UnknownError, and asks no eth_call, when the swapper has no code', async () => {
          const { request, entity } = post()

          expectAnswer(await handle(request), 'Onchain validation failed: UnknownError')
          expectWarned(entity, { swapperHasCode: false, erc1271Result: 'not_checked' })
          expect(node.methods).toEqual(['eth_getCode'])
        })

        it.each<[string, RpcAnswer]>([
          ['times out', 'hang'],
          ['fails with a JSON-RPC error', { error: { code: -32005, message: 'limit exceeded' } }],
        ])('keeps UnknownError when the probe eth_call %s', async (_, answer) => {
          useNode(SHORT_PROBE_TIMEOUT_MS)
          quoteReverts('0x')
          node.getCode = { result: DELEGATED_CODE }
          node.ethCall = answer
          const { request, entity } = post()

          expectAnswer(await handle(request), 'Onchain validation failed: UnknownError')
          expectWarned(entity, { swapperHasCode: true, delegate: DELEGATE, erc1271Result: 'not_checked' })
        })
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
