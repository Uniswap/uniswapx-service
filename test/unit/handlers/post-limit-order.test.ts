/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DutchOrder, OrderType, OrderValidation, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import { ErrorCode } from '../../../lib/handlers/base'
import { DEFAULT_MAX_OPEN_LIMIT_ORDERS } from '../../../lib/handlers/constants'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { getMaxLimitOpenOrders } from '../../../lib/handlers/post-limit-order/injector'
import { PostOrderHandler } from '../../../lib/handlers/post-order/handler'
import { HttpStatusCode } from '../../../lib/HttpStatusCode'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ORDER_INFO } from '../fixtures'

jest.mock('../../../lib/handlers/shared/sfn', () => {
  return {
    kickoffOrderTrackingSfn: jest.fn(),
  }
})

const MOCK_ARN_1 = 'MOCK_ARN_1'
const MOCK_ARN_5 = 'MOCK_ARN_5'

const DECODED_ORDER = {
  info: ORDER_INFO,
  hash: () => '0x0000000000000000000000000000000000000000000000000000000000000006',
  serialize: () => '0x01',
  chainId: 1,
}

jest.mock('@uniswap/uniswapx-sdk', () => {
  const originalSdk = jest.requireActual('@uniswap/uniswapx-sdk')
  return {
    ...originalSdk,
    DutchOrder: { parse: jest.fn() },
    OrderType: { Dutch: 'Dutch' },
  }
})

describe('Testing post limit order handler.', () => {
  const putOrderAndUpdateNonceTransactionMock = jest.fn()
  const countOrdersByOffererAndStatusMock = jest.fn()
  const validatorMock = jest.fn()
  const onchainValidationSucceededMock = jest.fn().mockResolvedValue(OrderValidation.OK) // Ordervalidation.Ok
  const validationFailedValidatorMock = jest.fn().mockResolvedValue(OrderValidation.ValidationFailed) // OrderValidation.ValidationFailed
  const mockSfnClient = jest.fn()

  const encodedOrder = '0x01'
  const postRequestBody = {
    orderHash: '0x01',
    encodedOrder: encodedOrder,
    signature:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
    chainId: 1,
    quoteId: '55e2cfca-5521-4a0a-b597-7bfb569032d7',
  }

  const event = {
    queryStringParameters: {},
    body: JSON.stringify(postRequestBody),
  }

  const mockLog = {
    info: () => jest.fn(),
    error: () => jest.fn(),
  } as any
  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }

  const ORDER = {
    encodedOrder: encodedOrder,
    chainId: 1,
    filler: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    signature:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
    nonce: '40',
    orderHash: '0x0000000000000000000000000000000000000000000000000000000000000006',
    orderStatus: ORDER_STATUS.OPEN,
    offerer: '0x0000000000000000000000000000000000000001',
    reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch]!.toLowerCase(),
    decayStartTime: 20,
    decayEndTime: 10,
    deadline: 10,
    quoteId: '55e2cfca-5521-4a0a-b597-7bfb569032d7',
    type: 'Dutch',
    input: {
      endAmount: '30',
      startAmount: '30',
      token: '0x0000000000000000000000000000000000000003',
    },
    outputs: [
      {
        endAmount: '50',
        startAmount: '60',
        token: '0x0000000000000000000000000000000000000005',
        recipient: '0x0000000000000000000000000000000000000004',
      },
    ],
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
    //@ts-ignore
    DutchOrder.parse.mockImplementation((_order: any, chainId: number) => ({ ...DECODED_ORDER, chainId }))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(ORDER)
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(DECODED_ORDER)
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: '0x0000000000000000000000000000000000000000000000000000000000000006' }),
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

      const postOrderResponse = await postOrderHandler.handler(
        {
          queryStringParameters: {},
          body: JSON.stringify({ ...postRequestBody, chainId: 5 }),
        } as any,
        {} as any
      )

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith({ ...ORDER, chainId: 5 })
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith({ ...DECODED_ORDER, chainId: 5 })
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: '0x0000000000000000000000000000000000000000000000000000000000000006' }),
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
        expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
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
        //@ts-ignore
        DutchOrder.parse.mockReturnValueOnce(
          Object.assign({}, DECODED_ORDER, {
            info: Object.assign({}, ORDER_INFO, {
              swapper: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
            }),
          })
        )
        expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
          statusCode: HttpStatusCode.Created,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).toBeCalled()
      })

      it('should reject order submission for offerer in high list at higher order count', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(201)
        validatorMock.mockReturnValue({ valid: true })
        //@ts-ignore
        DutchOrder.parse.mockReturnValueOnce(
          Object.assign({}, DECODED_ORDER, {
            info: Object.assign({}, ORDER_INFO, {
              offerer: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
            }),
          })
        )
        expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
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
      expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
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
      const invalidEvent = {
        body: JSON.stringify({ ...postRequestBody, ...invalidBodyField }),
        queryStringParameters: {},
      }
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })

    it('should not call StepFunctions', async () => {
      validatorMock.mockReturnValue({ valid: true })
      await postOrderHandler.handler(event as any, {} as any)
      expect(mockSfnClient).not.toHaveBeenCalled()
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      putOrderAndUpdateNonceTransactionMock.mockImplementation(() => {
        throw new Error('database unavailable')
      })

      validatorMock.mockReturnValue({ valid: true })

      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBody),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(ORDER)
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
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBody),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
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
      //@ts-ignore
      DutchOrder.parse.mockReturnValue({
        ...DECODED_ORDER,
        chainId: 137,
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify({
          ...postRequestBody,
          chainId: 137,
        }),
      }
      validatorMock.mockReturnValue({
        valid: true,
      })
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
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
