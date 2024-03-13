import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import { ErrorCode } from '../../../lib/handlers/base'
import { DEFAULT_MAX_OPEN_LIMIT_ORDERS } from '../../../lib/handlers/constants'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { getMaxLimitOpenOrders } from '../../../lib/handlers/post-limit-order/injector'
import { PostOrderHandler } from '../../../lib/handlers/post-order/handler'
import { HttpStatusCode } from '../../../lib/HttpStatusCode'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ChainId } from '../../../lib/util/chain'
import { formatOrderEntity } from '../../../lib/util/order'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { QUOTE_ID, SIGNATURE } from '../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

jest.mock('../../../lib/handlers/shared/sfn', () => {
  return {
    kickoffOrderTrackingSfn: jest.fn(),
  }
})

const MOCK_ARN_1 = 'MOCK_ARN_1'
const MOCK_ARN_5 = 'MOCK_ARN_5'

describe('Testing post limit order handler.', () => {
  const putOrderAndUpdateNonceTransactionMock = jest.fn()
  const countOrdersByOffererAndStatusMock = jest.fn()
  const validatorMock = jest.fn()
  const onchainValidationSucceededMock = jest.fn().mockResolvedValue(OrderValidation.OK) // Ordervalidation.Ok
  const validationFailedValidatorMock = jest.fn().mockResolvedValue(OrderValidation.ValidationFailed) // OrderValidation.ValidationFailed
  const mockSfnClient = jest.fn()

  const mockLog = {
    info: () => jest.fn(),
    error: () => jest.fn(),
  } as any
  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }

  const onChainValidatorMap = new OnChainValidatorMap([
    [
      1,
      {
        validate: onchainValidationSucceededMock,
      },
    ],
    [
      5,
      {
        validate: onchainValidationSucceededMock,
      },
    ],
    [
      137,
      {
        validate: validationFailedValidatorMock,
      },
    ],

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any)

  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {}
    },
    getRequestInjected: () => requestInjected,
  }

  const postOrderHandler = new PostOrderHandler(
    'post-limit-order',
    injectorPromiseMock,
    new UniswapXOrderService(
      {
        validate: validatorMock,
      } as any,
      onChainValidatorMap,
      {
        putOrderAndUpdateNonceTransaction: putOrderAndUpdateNonceTransactionMock,
        countOrdersByOffererAndStatus: countOrdersByOffererAndStatusMock,
      } as any,
      mockLog,
      getMaxLimitOpenOrders,
      OrderType.Limit,
      {
        logOrderPosted: jest.fn(),
        logCancelled: jest.fn(),
        logInsufficientFunds: jest.fn(),
      }
    )
  )

  beforeAll(() => {
    process.env['STATE_MACHINE_ARN_1'] = MOCK_ARN_1
    process.env['STATE_MACHINE_ARN_5'] = MOCK_ARN_5
    process.env['REGION'] = 'region'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      validatorMock.mockReturnValue({ valid: true })
      const order = SDKDutchOrderFactory.buildLimitOrder()

      // TODO(andy.smith): This is a bug in UniswapXOrderService. This should be OrderType.Limit
      const expectedOrderEntity = formatOrderEntity(order, SIGNATURE, OrderType.Dutch, ORDER_STATUS.OPEN, QUOTE_ID)

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
        }),
        {} as any
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order)
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
      validatorMock.mockReturnValue({ valid: true })

      const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.GÖRLI)

      // TODO(andy.smith): This is a bug in UniswapXOrderService. This should be OrderType.Limit
      const expectedOrderEntity = formatOrderEntity(order, SIGNATURE, OrderType.Dutch, ORDER_STATUS.OPEN, QUOTE_ID)

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          signature: SIGNATURE,
          quoteId: QUOTE_ID,
          chainId: ChainId.GÖRLI,
        }),
        {} as any
      )
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order)
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

  describe('Test order submission blocking', () => {
    describe('Max open orders', () => {
      it('should reject order submission for offerer when too many open orders exist', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(DEFAULT_MAX_OPEN_LIMIT_ORDERS + 1)
        validatorMock.mockReturnValue({ valid: true })
        const order = SDKDutchOrderFactory.buildLimitOrder()
        expect(
          await postOrderHandler.handler(
            PostOrderRequestFactory.request({
              encodedOrder: order.serialize(),
            }),
            {} as any
          )
        ).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).not.toBeCalled()
      })

      it('should allow more orders if in the high list', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(100)
        validatorMock.mockReturnValue({ valid: true })

        const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, {
          swapper: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
        })

        expect(
          await postOrderHandler.handler(
            PostOrderRequestFactory.request({
              encodedOrder: order.serialize(),
            }),
            {} as any
          )
        ).toMatchObject({
          statusCode: HttpStatusCode.Created,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).toBeCalled()
      })

      it('should reject order submission for offerer in high list at higher order count', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(201)
        validatorMock.mockReturnValue({ valid: true })

        const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, {
          swapper: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
        })
        expect(
          await postOrderHandler.handler(
            PostOrderRequestFactory.request({
              encodedOrder: order.serialize(),
            }),
            {} as any
          )
        ).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).not.toBeCalled()
      })
    })

    it('should return 500 if DDB call throws', async () => {
      countOrdersByOffererAndStatusMock.mockRejectedValueOnce(new Error('DDB error'))
      const order = SDKDutchOrderFactory.buildLimitOrder()

      expect(
        await postOrderHandler.handler(
          PostOrderRequestFactory.request({
            encodedOrder: order.serialize(),
          }),
          {} as any
        )
      ).toMatchObject({
        statusCode: HttpStatusCode.InternalServerError,
      })
    })
  })

  describe('Testing invalid request validation.', () => {
    it.each([
      [
        { encodedOrder: '0xbad_order' },
        '{"detail":"\\"encodedOrder\\" with value \\"0xbad_order\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,2000}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { signature: '0xbad_signature' },
        '{"detail":"\\"signature\\" with value \\"0xbad_signature\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [{ chainId: 0 }, `{"detail":"\\"chainId\\" must be one of [1, 5, 137]","errorCode":"VALIDATION_ERROR"}`],
      [{ quoteId: 'not_UUIDV4' }, '{"detail":"\\"quoteId\\" must be a valid GUID","errorCode":"VALIDATION_ERROR"}'],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = PostOrderRequestFactory.request({
        ...invalidBodyField,
      })
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })

    it('should not call StepFunctions', async () => {
      validatorMock.mockReturnValue({ valid: true })
      await postOrderHandler.handler(PostOrderRequestFactory.request(), {} as any)
      expect(mockSfnClient).not.toHaveBeenCalled()
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      putOrderAndUpdateNonceTransactionMock.mockImplementation(() => {
        throw new Error('database unavailable')
      })

      validatorMock.mockReturnValue({ valid: true })

      const order = SDKDutchOrderFactory.buildLimitOrder()
      // TODO(andy.smith): This is a bug in UniswapXOrderService. This should be OrderType.Limit
      const expectedOrderEntity = formatOrderEntity(order, SIGNATURE, OrderType.Dutch, ORDER_STATUS.OPEN, QUOTE_ID)

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
        }),
        {} as any
      )
      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
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
      validatorMock.mockReturnValue({
        valid: false,
        errorString,
      })

      const order = SDKDutchOrderFactory.buildLimitOrder()
      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
        }),
        {} as any
      )
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
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
      validatorMock.mockReturnValue({
        valid: true,
      })

      const order = SDKDutchOrderFactory.buildLimitOrder(ChainId.POLYGON)
      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({ chainId: ChainId.POLYGON, encodedOrder: order.serialize() }),
        {} as any
      )
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
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
