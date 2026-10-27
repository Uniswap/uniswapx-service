import { CosignedV2DutchOrder, OrderType, OrderValidation, PermissionedTokenValidator } from '@uniswap/uniswapx-sdk'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { BigNumber } from 'ethers'
import { toOrderEntity } from '../../../../lib/core/orders/storedRow'
import { ErrorCode } from '../../../../lib/handlers/base'
import { AVERAGE_BLOCK_TIME } from '../../../../lib/handlers/check-order-status/util'
import { DEFAULT_MAX_OPEN_ORDERS, PRIORITY_ORDER_TARGET_BLOCK_BUFFER } from '../../../../lib/handlers/constants'
import { DUTCH_AUCTION_ORDER_ROUTE } from '../../../../lib/handlers/post-order/routes'
import { HttpStatusCode } from '../../../../lib/HttpStatusCode'
import { log } from '../../../../lib/Logging'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { ChainId } from '../../../../lib/util/chain'
import { DUTCH_LIMIT } from '../../../../lib/util/order'
import { Permit2Validator } from '../../../../lib/util/Permit2Validator'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { cosignOrder, signOrder } from '../../../factories/SignedOrderFactory'
import { freezeClock, restoreClock } from '../../../fakes/clock'
import { makePostOrderHandler, PostOrderHandlerHarness } from '../../builders/post-path'
import {
  COSIGNATURE,
  EVENT_CONTEXT,
  MOCK_LATEST_BLOCK,
  QUOTE_ID,
  REQUEST_ID,
  SIGNATURE,
  TestWallets,
  Tokens,
  ZERO_SIGNATURE,
} from '../../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

jest.mock('../../../../lib/handlers/shared/sfn', () => ({ kickoffOrderTrackingSfn: jest.fn() }))

// The handler rebuilds these from STATE_MACHINE_NAMES + REGION + ACCOUNT_ID
// (see lib/util/stateMachineArn.ts), so the expected values are full ARNs.
const MOCK_ACCOUNT_ID = '123456789012'
const MOCK_SM_REGION = 'region'
const mockArn = (name: string) => `arn:aws:states:${MOCK_SM_REGION}:${MOCK_ACCOUNT_ID}:stateMachine:${name}`
const MOCK_ARN_1 = mockArn('MOCK_SM_1')
const MOCK_ARN_42161 = mockArn('MOCK_SM_42161')
const MOCK_ARN_11155111 = mockArn('MOCK_SM_11155111')

// Cases both post routes share live in post-order-shared.test.ts.
describe('Testing post order handler.', () => {
  let harness: PostOrderHandlerHarness
  const handle = (event: APIGatewayProxyEvent) => harness.handler.handler(event, EVENT_CONTEXT)

  beforeAll(() => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({
      1: 'MOCK_SM_1',
      42161: 'MOCK_SM_42161',
      11155111: 'MOCK_SM_11155111',
    })
    process.env['ACCOUNT_ID'] = MOCK_ACCOUNT_ID
    process.env['REGION'] = MOCK_SM_REGION
    log.setLogLevel('SILENT')
  })

  beforeEach(() => {
    freezeClock(100)
    harness = makePostOrderHandler(DUTCH_AUCTION_ORDER_ROUTE)
  })

  afterEach(() => {
    restoreClock()
  })

  // The generic post-path tests use a Dutch_V2 order: an order type this route accepts.
  const buildV2Order = (
    chainId: number = ChainId.MAINNET,
    overrides: Parameters<typeof SDKDutchOrderV2Factory.buildDutchV2Order>[1] = {}
  ) =>
    new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(chainId, overrides),
      SIGNATURE,
      chainId,
      QUOTE_ID,
      REQUEST_ID
    )

  const postV2Request = (order: DutchV2Order) =>
    PostOrderRequestFactory.request({
      encodedOrder: order.inner.serialize(),
      signature: SIGNATURE,
      chainId: order.chainId,
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
      orderType: OrderType.Dutch_V2,
    })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      const order = buildV2Order()
      const expectedOrderEntity = toOrderEntity(order)

      const postOrderResponse = await handle(postV2Request(order))

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([expectedOrderEntity])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order.inner])
      expect(harness.tracking.calls).toEqual([
        {
          stateMachineArn: MOCK_ARN_1,
          input: {
            orderHash: expectedOrderEntity.orderHash,
            chainId: 1,
            orderStatus: 'open',
            quoteId: QUOTE_ID,
            orderType: OrderType.Dutch_V2,
            stateMachineArn: MOCK_ARN_1,
            runIndex: 0,
          },
        },
      ])

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response for Dutch_V2', async () => {
      const order = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), SIGNATURE, 1, undefined, REQUEST_ID)
      const expectedOrderEntity = toOrderEntity(order)

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Dutch_V2,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: expect.any(String),
        }),
      ])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order.inner])
      expect(harness.tracking.calls).toEqual([expect.objectContaining({ stateMachineArn: MOCK_ARN_1 })])

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response for Priority', async () => {
      const order = new PriorityOrder(SDKPriorityOrderFactory.buildPriorityOrder(), SIGNATURE, 1, undefined, REQUEST_ID)

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Priority,
        })
      )

      // cosignature and cosignerData gets overwritten within the handler
      order.inner.info.cosignature = COSIGNATURE
      order.inner.info.cosignerData = {
        auctionTargetBlock: BigNumber.from(
          MOCK_LATEST_BLOCK + PRIORITY_ORDER_TARGET_BLOCK_BUFFER[order.chainId as ChainId]!
        ), // No extra block since timestamp difference should be 0
      }
      const expectedOrderEntity = toOrderEntity(order)
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: expect.any(String),
          cosignature: COSIGNATURE,
          cosignerData: {
            // MOCK_LATEST_BLOCK + 3
            auctionTargetBlock: MOCK_LATEST_BLOCK + PRIORITY_ORDER_TARGET_BLOCK_BUFFER[order.chainId as ChainId]!,
          },
        }),
      ])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order.inner])
      expect(harness.tracking.calls).toEqual([expect.objectContaining({ stateMachineArn: MOCK_ARN_1 })])

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('should add extra block when timestamp difference is more than 75% of block time', async () => {
      const order = new PriorityOrder(
        SDKPriorityOrderFactory.buildPriorityOrder(),
        SIGNATURE,
        ChainId.MAINNET,
        undefined,
        REQUEST_ID
      )

      // Mock provider with old timestamp to trigger extra block logic
      const currentTime = Math.floor(Date.now() / 1000)
      const blockTimeSeconds = AVERAGE_BLOCK_TIME(ChainId.MAINNET)
      const oldTimestamp = currentTime - blockTimeSeconds * 0.8 // 80% of block time ago (above 75% threshold)

      // Create a new provider map with the old timestamp
      const mockProviderWithOldTimestamp = {
        getBlockNumber: jest.fn().mockResolvedValue(MOCK_LATEST_BLOCK),
        getBlock: jest.fn().mockResolvedValue({
          number: MOCK_LATEST_BLOCK,
          timestamp: oldTimestamp,
        }),
      }

      const mockProviderMapWithOldTimestamp = new Map([
        [ChainId.MAINNET, mockProviderWithOldTimestamp as any],
        [ChainId.UNICHAIN, mockProviderWithOldTimestamp as any],
        [ChainId.BASE, mockProviderWithOldTimestamp as any],
        [ChainId.POLYGON, mockProviderWithOldTimestamp as any],
      ])

      harness = makePostOrderHandler(DUTCH_AUCTION_ORDER_ROUTE, { providerMap: mockProviderMapWithOldTimestamp })

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Priority,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      const expectedBuffer = PRIORITY_ORDER_TARGET_BLOCK_BUFFER[ChainId.MAINNET]!
      const expectedTargetBlock = MOCK_LATEST_BLOCK + expectedBuffer + 1 // +1 for extra block

      expect(harness.repository.puts).toEqual([
        expect.objectContaining({
          cosignerData: {
            auctionTargetBlock: expectedTargetBlock,
          },
        }),
      ])
    })

    it('Testing valid request and response for Dutch_V3', async () => {
      const order = new DutchV3Order(
        SDKDutchOrderV3Factory.buildDutchV3Order(),
        SIGNATURE,
        ChainId.ARBITRUM_ONE,
        undefined,
        REQUEST_ID
      )
      const expectedOrderEntity = toOrderEntity(order)

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Dutch_V3,
          chainId: ChainId.ARBITRUM_ONE,
        })
      )
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: REQUEST_ID,
        }),
      ])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order.inner])
      expect(harness.tracking.calls).toEqual([expect.objectContaining({ stateMachineArn: MOCK_ARN_42161 })])

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response on another chain', async () => {
      const order = buildV2Order(ChainId.SEPOLIA)
      const expectedOrderEntity = toOrderEntity(order)

      const postOrderResponse = await handle(postV2Request(order))
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([expectedOrderEntity])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order.inner])
      expect(harness.tracking.calls).toEqual([expect.objectContaining({ stateMachineArn: MOCK_ARN_11155111 })])
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('Decaying Dutch V1 orders', () => {
    it.each([[undefined], [OrderType.Dutch]])('rejects one posted with orderType %p', async (orderType) => {
      const order = SDKDutchOrderFactory.buildDutchOrder()

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          orderType,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(JSON.parse(postOrderResponse.body)).toMatchObject({
        errorCode: ErrorCode.OrderParseFail,
        detail: 'Unsupported orderType: Dutch',
      })
      expect(harness.orderValidator.calls).toEqual([])
      expect(harness.repository.puts).toEqual([])
      expect(harness.tracking.calls).toEqual([])
    })
  })

  describe('Deprecated DutchLimit orders', () => {
    it('rejects one posted with orderType DutchLimit', async () => {
      const order = SDKDutchOrderFactory.buildLimitOrder()

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          orderType: DUTCH_LIMIT,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(JSON.parse(postOrderResponse.body)).toMatchObject({
        errorCode: ErrorCode.OrderParseFail,
        detail: 'Unsupported orderType: DutchLimit',
      })
      expect(harness.orderValidator.calls).toEqual([])
      expect(harness.repository.puts).toEqual([])
      expect(harness.tracking.calls).toEqual([])
    })
  })

  describe('Test order submission blocking', () => {
    it('should fail if tokenIn = address(0)', async () => {
      const order = buildV2Order(ChainId.MAINNET, {
        input: {
          token: '0x0000000000000000000000000000000000000000',
        },
      })
      expect(await handle(postV2Request(order))).toMatchObject({
        body: JSON.stringify({
          errorCode: ErrorCode.InvalidTokenInAddress,
          id: 'testRequest',
        }),
        statusCode: HttpStatusCode.BadRequest,
      })
    })
  })

  describe('Testing posts to the wrong route', () => {
    it.each([undefined, OrderType.Limit])(
      'rejects a limit order (orderType %s) and points to the limit order route',
      async (orderType) => {
        const order = SDKDutchOrderFactory.buildLimitOrder()
        const postOrderResponse = await handle(
          PostOrderRequestFactory.request({
            encodedOrder: order.serialize(),
            orderType,
          })
        )

        expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
        expect(JSON.parse(postOrderResponse.body)).toEqual({
          detail: 'Limit orders must be posted to /v2/limit-order',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        })
        expect(harness.orderValidator.calls).toEqual([])
        expect(harness.repository.puts).toEqual([])
        expect(harness.tracking.calls).toEqual([])
      }
    )
  })

  describe('Permissioned input token (BUIDL) orders', () => {
    // The order quoter is bypassed for these, so the post path itself has to authenticate the
    // order. The token's transfer check is isolated as passing for an eligible swapper/filler
    // pair; everything from the request body to the write call is the real code.
    const { swapper, cosigner } = TestWallets

    let preTransferCheck: jest.SpyInstance
    let permit2Validate: jest.SpyInstance
    let order: CosignedV2DutchOrder
    let signature: string

    const buildPermissionedOrder = (swapperAddress: string) =>
      SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
        swapper: swapperAddress,
        cosigner: cosigner.address,
        input: { token: Tokens.MAINNET.BUIDL, startAmount: '1000000', endAmount: '1000000' },
      })

    const post = (encodedOrder: string, postedSignature: string) =>
      handle(
        PostOrderRequestFactory.request({ encodedOrder, signature: postedSignature, orderType: OrderType.Dutch_V2 })
      )

    beforeAll(async () => {
      order = await cosignOrder(buildPermissionedOrder(swapper.address), cosigner)
      signature = await signOrder(order, swapper)
    })

    beforeEach(() => {
      preTransferCheck = jest.spyOn(PermissionedTokenValidator, 'preTransferCheck').mockResolvedValue(true)
      permit2Validate = jest.spyOn(Permit2Validator.prototype, 'validate').mockResolvedValue(OrderValidation.OK)
    })

    afterEach(() => {
      preTransferCheck.mockRestore()
      permit2Validate.mockRestore()
    })

    it('accepts the order with its swapper signature and cosignature, without the order quoter', async () => {
      const response = await post(order.serialize(), signature)

      expect(response.statusCode).toEqual(HttpStatusCode.Created)
      expect(harness.repository.puts).toEqual([
        expect.objectContaining({
          orderHash: order.hash().toLowerCase(),
          signature,
          offerer: swapper.address.toLowerCase(),
        }),
      ])
      expect(harness.onChainValidator.calls).toEqual([])
    })

    it('rejects the same order bytes with a zeroed signature, so a stored order cannot be overwritten', async () => {
      const response = await post(order.serialize(), ZERO_SIGNATURE)

      expect(response).toMatchObject({
        statusCode: HttpStatusCode.BadRequest,
        body: JSON.stringify({
          detail: 'Signature validation failed: InvalidSignature',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
      })
      // the write is one transaction with the swapper's nonce update, so neither happens
      expect(harness.repository.puts).toEqual([])
      expect(preTransferCheck).not.toHaveBeenCalled()
    })

    it("rejects an order fabricated under another wallet's address with an empty cosignature", async () => {
      const victim = TestWallets.stranger
      const response = await post(buildPermissionedOrder(victim.address).serialize(), ZERO_SIGNATURE)

      expect(response).toMatchObject({
        statusCode: HttpStatusCode.BadRequest,
        body: JSON.stringify({
          detail: 'Signature validation failed: InvalidCosignature',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
      })
      expect(harness.repository.puts).toEqual([])
      expect(harness.repository.countCalls).toEqual([
        { offerer: victim.address.toLowerCase(), max: DEFAULT_MAX_OPEN_ORDERS },
      ])
    })
  })
})
