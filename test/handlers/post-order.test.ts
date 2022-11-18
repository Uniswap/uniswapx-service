import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { mockClient } from 'aws-sdk-client-mock'
import { BigNumber } from 'ethers'
import { ORDER_STATUS } from '../../lib/entities'
import { PostOrderHandler } from '../../lib/handlers/post-order/handler'

const mockSfnClient = mockClient(SFNClient)
mockSfnClient.on(StartExecutionCommand).resolves({})

const DECODED_ORDER = {
  info: {
    deadline: 10,
    offerer: '0x0000000000000000000000000000000000000001',
    reactor: '0x0000000000000000000000000000000000000002',
    startTime: 20,
    input: {
      token: '0x0000000000000000000000000000000000000003',
      amount: BigNumber.from('30'),
    },
    nonce: BigNumber.from('40'),
    outputs: [
      {
        endAmount: BigNumber.from(50),
        startAmount: BigNumber.from(60),
        recipient: '0x0000000000000000000000000000000000000004',
        token: '0x0000000000000000000000000000000000000005',
      },
    ],
  },
  hash: () => '0x0000000000000000000000000000000000000000000000000000000000000006',
}

const MOCK_ARN = 'MOCK_ARN'

jest.mock('gouda-sdk', () => ({
  parseOrder: () => DECODED_ORDER,
}))

describe('Testing post order handler.', () => {
  const putOrderAndUpdateNonceTransaction = jest.fn()
  const validatorMock = jest.fn()
  const encodedOrder = '0x01'
  const postRequestBody = {
    encodedOrder: encodedOrder,
    signature:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
    chainId: 1,
  }

  const requestInjected = {
    requestId: 'testRequest',
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }

  const ORDER = {
    encodedOrder: encodedOrder,
    signature:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
    nonce: '40',
    orderHash: '0x0000000000000000000000000000000000000000000000000000000000000006',
    orderStatus: ORDER_STATUS.UNVERIFIED,
    offerer: '0x0000000000000000000000000000000000000001',
    sellToken: '0x0000000000000000000000000000000000000003',
    sellAmount: '30',
    reactor: '0x0000000000000000000000000000000000000002',
    startTime: 20,
    endTime: 10,
    deadline: 10,
  }

  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          putOrderAndUpdateNonceTransaction,
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
  })

  afterEach(() => {
    jest.clearAllMocks()
    mockSfnClient.reset()
  })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBody),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(putOrderAndUpdateNonceTransaction).toBeCalledWith(ORDER)
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
      [{ chainId: 0 }, '{"detail":"\\"chainId\\" must be one of [1, 5]","errorCode":"VALIDATION_ERROR"}'],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = {
        body: JSON.stringify({ ...postRequestBody, ...invalidBodyField }),
        queryStringParameters: {},
      }
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransaction).not.toHaveBeenCalled()
      expect(postOrderResponse.statusCode).toEqual(400)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })

    it('should call StepFunctions.startExecution method with the correct params', async () => {
      expect(async () => await postOrderHandler['kickoffOrderTrackingSfn']('0xhash', 1, MOCK_ARN)).not.toThrow()
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toStrictEqual(
        new StartExecutionCommand({
          stateMachineArn: MOCK_ARN,
          name: '0xhash',
          input: JSON.stringify({
            orderHash: '0xhash',
            chainId: 1,
            orderStatus: ORDER_STATUS.UNVERIFIED,
          }),
        }).input
      )
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      putOrderAndUpdateNonceTransaction.mockImplementation(() => {
        throw new Error('database unavailable')
      })

      validatorMock.mockReturnValue({ valid: true })

      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBody),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(putOrderAndUpdateNonceTransaction).toBeCalledWith(ORDER)
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
      expect(putOrderAndUpdateNonceTransaction).not.toHaveBeenCalled()
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
