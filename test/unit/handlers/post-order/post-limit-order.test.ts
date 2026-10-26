import { OrderType } from '@uniswap/uniswapx-sdk'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { ErrorCode } from '../../../../lib/handlers/base'
import { LIMIT_ORDER_ROUTE } from '../../../../lib/handlers/post-order/routes'
import { HttpStatusCode } from '../../../../lib/HttpStatusCode'
import { ChainId } from '../../../../lib/util/chain'
import { formatOrderEntity } from '../../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { freezeClock, restoreClock } from '../../../fakes/clock'
import { makePostOrderHandler, PostOrderHandlerHarness } from '../../builders/post-path'
import { EVENT_CONTEXT, QUOTE_ID, SIGNATURE } from '../../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

jest.mock('../../../../lib/handlers/shared/sfn', () => ({ kickoffOrderTrackingSfn: jest.fn() }))

// The handler rebuilds ARNs from STATE_MACHINE_NAMES + REGION + ACCOUNT_ID;
// see lib/util/stateMachineArn.ts.
const MOCK_ACCOUNT_ID = '123456789012'
const MOCK_SM_REGION = 'region'

// Cases both post routes share live in post-order-shared.test.ts.
describe('Testing post limit order handler.', () => {
  let harness: PostOrderHandlerHarness
  const handle = (event: APIGatewayProxyEvent) => harness.handler.handler(event, EVENT_CONTEXT)

  beforeAll(() => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({
      1: 'MOCK_SM_1',
      11155111: 'MOCK_SM_11155111',
    })
    process.env['ACCOUNT_ID'] = MOCK_ACCOUNT_ID
    process.env['REGION'] = MOCK_SM_REGION
  })

  beforeEach(() => {
    freezeClock(100)
    harness = makePostOrderHandler(LIMIT_ORDER_ROUTE)
  })

  afterEach(() => {
    restoreClock()
  })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      const order = SDKDutchOrderFactory.buildLimitOrder()

      // TODO(andy.smith): This is a bug in UniswapXOrderService. https://linear.app/uniswap/issue/DAT-313/fix-order-type-for-limit-orders-in-database
      const expectedOrderEntity = formatOrderEntity(order, SIGNATURE, QUOTE_ID)

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([expectedOrderEntity])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order])
      expect(harness.tracking.calls).toEqual([
        { input: expect.objectContaining({ orderType: 'Limit' }), stateMachineArn: expect.anything() },
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

    it('Testing valid request and response on another chain', async () => {
      const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.SEPOLIA)

      // TODO(andy.smith): This is a bug in UniswapXOrderService. https://linear.app/uniswap/issue/DAT-313/fix-order-type-for-limit-orders-in-database
      const expectedOrderEntity = formatOrderEntity(order, SIGNATURE, QUOTE_ID)

      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
          chainId: ChainId.SEPOLIA,
        })
      )
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(harness.repository.puts).toEqual([expectedOrderEntity])
      expect(harness.onChainValidator.calls).toHaveLength(1)
      expect(harness.orderValidator.calls).toEqual([order])
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

  describe('Testing posts to the wrong route', () => {
    it('rejects a Dutch_V2 order and points to the Dutch auction order route', async () => {
      const order = SDKDutchOrderV2Factory.buildDutchV2Order()
      const postOrderResponse = await handle(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          orderType: OrderType.Dutch_V2,
        })
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(JSON.parse(postOrderResponse.body)).toEqual({
        detail: 'Dutch_V2 orders must be posted to /v2/order',
        errorCode: ErrorCode.InvalidOrder,
        id: 'testRequest',
      })
      expect(harness.orderValidator.calls).toEqual([])
      expect(harness.repository.puts).toEqual([])
      expect(harness.tracking.calls).toEqual([])
    })
  })
})
