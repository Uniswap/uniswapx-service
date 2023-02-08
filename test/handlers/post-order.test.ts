import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { mockClient } from 'aws-sdk-client-mock'
import { BigNumber } from 'ethers'
import { ORDER_STATUS } from '../../lib/entities'
import { PostOrderHandler } from '../../lib/handlers/post-order/handler'

const MOCK_ARN = 'MOCK_ARN'
const MOCK_HASH = '0xhash'
const MOCK_START_EXECUTION_INPUT = JSON.stringify({
  orderHash: MOCK_HASH,
  chainId: 1,
  orderStatus: ORDER_STATUS.UNVERIFIED,
})

const mockSfnClient = mockClient(SFNClient)
mockSfnClient
  .on(StartExecutionCommand, {
    stateMachineArn: MOCK_ARN,
    name: MOCK_HASH,
    input: MOCK_START_EXECUTION_INPUT,
  })
  .resolves({})

const DECODED_ORDER = {
  info: {
    deadline: 10,
    offerer: '0x0000000000000000000000000000000000000001',
    reactor: '0x0000000000000000000000000000000000000002',
    startTime: 20,
    input: {
      token: '0x0000000000000000000000000000000000000003',
      endAmount: BigNumber.from(30),
      startAmount: BigNumber.from(30),
    },
    nonce: BigNumber.from('40'),
    outputs: [
      {
        endAmount: BigNumber.from(50),
        startAmount: BigNumber.from(60),
        recipient: '0x0000000000000000000000000000000000000004',
        token: '0x0000000000000000000000000000000000000005',
        isFeeOutput: false,
      },
    ],
  },
  hash: () => '0x0000000000000000000000000000000000000000000000000000000000000006',
  serialize: () => '0x01',
  validation: { data: { filler: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' } },
  chainId: 1,
}

jest.mock('gouda-sdk', () => ({
  DutchLimitOrder: { parse: () => DECODED_ORDER },
  OrderType: { DutchLimit: 'DutchLimit' },
}))

describe('Testing post order handler.', () => {
  const putOrderAndUpdateNonceTransactionMock = jest.fn()
  const countOrdersByOffererAndStatusMock = jest.fn()
  const validatorMock = jest.fn()
  const encodedOrder = '0x01'
  const postRequestBody = {
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

  const requestInjected = {
    requestId: 'testRequest',
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }

  const ORDER = {
    encodedOrder: encodedOrder,
    chainId: 1,
    filler: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    signature:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
    nonce: '40',
    orderHash: '0x0000000000000000000000000000000000000000000000000000000000000006',
    orderStatus: ORDER_STATUS.UNVERIFIED,
    offerer: '0x0000000000000000000000000000000000000001',
    reactor: '0x0000000000000000000000000000000000000002',
    startTime: 20,
    endTime: 10,
    deadline: 10,
    quoteId: '55e2cfca-5521-4a0a-b597-7bfb569032d7',
    type: 'DutchLimit',
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
        isFeeOutput: false,
      },
    ],
  }

  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          putOrderAndUpdateNonceTransaction: putOrderAndUpdateNonceTransactionMock,
          countOrdersByOffererAndStatus: countOrdersByOffererAndStatusMock,
        },
        orderValidator: {
          validate: validatorMock,
        },
      }
    },
    getRequestInjected: () => requestInjected,
  }

  const postOrderHandler = new PostOrderHandler('post-order', injectorPromiseMock)

  beforeAll(() => {
    process.env['STATE_MACHINE_ARN'] = MOCK_ARN
    process.env['REGION'] = 'region'
  })

  afterEach(() => {
    jest.clearAllMocks()
    mockSfnClient.reset()
  })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(ORDER)
      expect(validatorMock).toBeCalledWith(DECODED_ORDER)
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: '0x0000000000000000000000000000000000000000000000000000000000000006' }),
        statusCode: 201,
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
    it('should reject order submission for offerer when too many open orders exist', async () => {
      countOrdersByOffererAndStatusMock.mockReturnValueOnce(100)
      validatorMock.mockReturnValue({ valid: true })
      expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
        body: JSON.stringify({
          errorCode: 'TOO_MANY_OPEN_ORDERS',
          id: 'testRequest',
        }),
        statusCode: 403,
      })
      expect(countOrdersByOffererAndStatusMock).toBeCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toBeCalled()
    })

    it('should return 500 if DDB call throws', async () => {
      countOrdersByOffererAndStatusMock.mockRejectedValueOnce(new Error('DDB error'))
      expect(await postOrderHandler.handler(event as any, {} as any)).toMatchObject({
        statusCode: 500,
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
      [{ chainId: 0 }, '{"detail":"\\"chainId\\" must be one of [1, 5, TENDERLY]","errorCode":"VALIDATION_ERROR"}'],
      [{ quoteId: 'not_UUIDV4' }, '{"detail":"\\"quoteId\\" must be a valid GUID","errorCode":"VALIDATION_ERROR"}'],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = {
        body: JSON.stringify({ ...postRequestBody, ...invalidBodyField }),
        queryStringParameters: {},
      }
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(postOrderResponse.statusCode).toEqual(400)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })

    it('should call StepFunctions.startExecution method with the correct params', async () => {
      const sfnInput = { orderHash: '0xhash', chainId: 1, quoteId: 'quoteId', orderStatus: ORDER_STATUS.UNVERIFIED }
      expect(async () => await postOrderHandler['kickoffOrderTrackingSfn'](sfnInput, MOCK_ARN)).not.toThrow()
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toStrictEqual(
        new StartExecutionCommand({
          stateMachineArn: MOCK_ARN,
          input: JSON.stringify(sfnInput),
        }).input
      )
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
        body: JSON.stringify({ errorCode: 'database unavailable', id: 'testRequest' }),
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('When offchain validation fails', () => {
    it('Throws 400', async () => {
      const errorCode = 'Invalid order'
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
        statusCode: 400,
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
