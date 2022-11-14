import { BigNumber } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities'
import { PostOrderHandler } from '../../lib/handlers/post-order/handler'

const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

// mock decoded order response from sdk
jest.mock('gouda-sdk', () => ({
  parseOrder: () => {
    return {
      info: {
        deadline: 2 ** 31 - 1,
        offerer: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
        reactor: '0xE9781560d93c27aa4C4F3543631d191D10608d20',
        startTime: 2 ** 30,
        input: {
          token: USDC_MAINNET,
          amount: BigNumber.from('14000000'),
        },
        nonce: BigNumber.from('25'),
        outputs: [
          {
            endAmount: BigNumber.from(0),
            startAmount: BigNumber.from(0),
            recipient: USDC_MAINNET,
            token: USDC_MAINNET,
          },
        ],
      },
      hash: () => '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4',
    }
  },
}))

describe('Testing post order handler.', () => {
  // Creating mocks for all the handler dependencies.
  const postOrderMock = jest.fn()
  const validationProviderMock = jest.fn()
  const encodedOrder =
    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f0000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000006364432c0000000000000000000000000000000000000000000000000000000063644200000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000e4e1c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000000000000000000000000000ac2d18f78e5c8000000000000000000000000000000000000000000000000000a8c0ff92d4c00000000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f'
  const postRequestBodyMock = {
    encodedOrder: encodedOrder,
    signature:
      '0xd3ed296bc55f59105abfd47566f65d2984dab6a49deac772d9c33d047c9952272642a5131f37ba8766db78b3302f939079c702e5627ea1d80a8a9d8cf54c5f8a1c',
    chainId: 1,
  }

  const requestInjectedMock = {
    requestId: 'testRequest',
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  // Only the required fields
  const MOCK_ORDER_MINIMAL: OrderEntity = {
    encodedOrder: encodedOrder,
    signature:
      '0xd3ed296bc55f59105abfd47566f65d2984dab6a49deac772d9c33d047c9952272642a5131f37ba8766db78b3302f939079c702e5627ea1d80a8a9d8cf54c5f8a1c',
    nonce: '25',
    orderHash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4',
    orderStatus: ORDER_STATUS.UNVERIFIED,
    offerer: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'.toLowerCase(),
  }

  // All fields, including optional ones
  const MOCK_ORDER: OrderEntity = {
    ...MOCK_ORDER_MINIMAL,
    sellToken: USDC_MAINNET.toLowerCase(),
    sellAmount: '14000000',
    reactor: '0xE9781560d93c27aa4C4F3543631d191D10608d20'.toLowerCase(),
    startTime: 2 ** 30,
    endTime: 2 ** 31 - 1,
    deadline: 2 ** 31 - 1,
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          putOrderAndUpdateNonceTransaction: postOrderMock,
        },
        orderValidator: {
          validate: validationProviderMock,
        },
      }
    },
  }

  const postOrderHandler = new PostOrderHandler('post-order', injectorPromiseMock)

  beforeAll(async () => {
    postOrderMock.mockReturnValue('0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4')
    validationProviderMock.mockReturnValue({ valid: true })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  injectorPromiseMock.getRequestInjected = () => requestInjectedMock

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderMock).toBeCalledWith(MOCK_ORDER)
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4' }),
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
        body: JSON.stringify({ ...postRequestBodyMock, ...invalidBodyField }),
        queryStringParameters: {},
      }
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
      expect(validationProviderMock).not.toHaveBeenCalled()
      expect(postOrderMock).not.toHaveBeenCalled()
      expect(postOrderResponse.statusCode).toEqual(400)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      const error = new Error('database unavailable')
      postOrderMock.mockImplementation(() => {
        throw error
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderMock).toBeCalledWith(MOCK_ORDER)
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ errorCode: error.message, id: 'testRequest' }),
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
      const errorCode = 'Order failed off-chain validation'
      const errorString = 'testing offchain validation'
      validationProviderMock.mockReturnValue({
        valid: false,
        errorString,
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderMock).not.toHaveBeenCalled()
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
