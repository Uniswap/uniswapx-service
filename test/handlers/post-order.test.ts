const parseOrderMock = jest.fn()

import { BigNumber } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities'
import { PostOrderHandler } from '../../lib/handlers/post-order/handler'

const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

// set to expire in 10 minutes
const deadlineMock = 10*60+(new Date().getTime())/1000
const offererMock = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'
const sellTokenMock = USDC_MAINNET
const sellAmountMock = '14000000'
const reactorMock = '0xE9781560d93c27aa4C4F3543631d191D10608d20'
const startTimeMock = (new Date().getTime())/1000
const nonceMock = '25'
const orderHashMock = '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4'
const requestIdMock = 'testRequest'

// mock decoded order response from sdk
jest.mock('gouda-sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseOrder: parseOrderMock
}))

const infoMock = { 
  deadline: deadlineMock,
  offerer: offererMock,
  reactor: reactorMock,
  startTime: startTimeMock,
  input: {token: sellTokenMock, amount: BigNumber.from(sellAmountMock)},
  nonce: BigNumber.from(nonceMock),
  outputs: [{endAmount:BigNumber.from(0), startAmount:BigNumber.from(0), recipient:USDC_MAINNET, token:USDC_MAINNET}]
}

describe('Testing post order handler.', () => {
  // Creating mocks for all the handler dependencies.
  const postOrderMock = jest.fn()
  const encodedOrderMock = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f0000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000006364432c0000000000000000000000000000000000000000000000000000000063644200000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000e4e1c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000000000000000000000000000ac2d18f78e5c8000000000000000000000000000000000000000000000000000a8c0ff92d4c00000000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f'
  const signatureMock = '0xd3ed296bc55f59105abfd47566f65d2984dab6a49deac772d9c33d047c9952272642a5131f37ba8766db78b3302f939079c702e5627ea1d80a8a9d8cf54c5f8a1c'
  const postRequestBodyMock = {
    encodedOrder: encodedOrderMock,
    signature: signatureMock,
    chainId: 1
  }
  const requestInjectedMock = {
    requestId: requestIdMock,
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  // Only the required fields
  const MOCK_ORDER_MINIMAL: OrderEntity = {
    encodedOrder: encodedOrderMock,
    signature: signatureMock,
    nonce: nonceMock,
    orderHash: orderHashMock,
    orderStatus: ORDER_STATUS.UNVERIFIED,
    offerer: offererMock.toLowerCase(),
  }

  // All fields, including optional ones
  const MOCK_ORDER: OrderEntity = {
    ...MOCK_ORDER_MINIMAL,
    sellToken: sellTokenMock.toLowerCase(),
    sellAmount: sellAmountMock,
    reactor: reactorMock.toLowerCase(),
    startTime: startTimeMock,
    endTime: deadlineMock,
    deadline: deadlineMock,
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
            putOrderAndUpdateNonceTransaction: postOrderMock,
        }
      }
    }
  }

  const postOrderHandler = new PostOrderHandler('post-order', injectorPromiseMock)

  beforeEach(async () => {
    postOrderMock.mockReturnValue(orderHashMock)
    parseOrderMock.mockReturnValue({
      info: infoMock,
      hash: () => orderHashMock
    })
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
        body: JSON.stringify({ hash: orderHashMock }),
        statusCode: 201,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
  })

  describe('Testing invalid request validation.', () => {
    it.each([
      [{ encodedOrder: '0xbad_order' }, "{\"detail\":\"\\\"encodedOrder\\\" with value \\\"0xbad_order\\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,2000}$/\",\"errorCode\":\"VALIDATION_ERROR\"}"],
      [{ signature: '0xbad_signature' }, "{\"detail\":\"\\\"signature\\\" with value \\\"0xbad_signature\\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/\",\"errorCode\":\"VALIDATION_ERROR\"}"],
      [{ chainId: 0 }, "{\"detail\":\"\\\"chainId\\\" must be one of [1, 5]\",\"errorCode\":\"VALIDATION_ERROR\"}"],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = {
        body: JSON.stringify({ ...postRequestBodyMock, ...invalidBodyField }),
        queryStringParameters: {},
      }
      const postOrderResponse = await postOrderHandler.handler(invalidEvent as any, {} as any)
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
        body: JSON.stringify({ errorCode: error.message, id: requestIdMock }),
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
  })

  describe('Testing off chain validation', () => {
    it('Testing invalid parsed deadline.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          deadline: new Date().getTime()/1000
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid deadline\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed offerer.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          offerer: '0xhacker_offerer'
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid offerer\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed reactor.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          reactor: '0xfake_reactor'
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid reactor\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed startTime.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          startTime: deadlineMock+1
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid startTime\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed outputs: endAmount.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          outputs: [{endAmount:BigNumber.from(-1), startAmount:BigNumber.from(0), recipient:USDC_MAINNET, token:USDC_MAINNET}]
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid endAmount -1\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed outputs: startAmount.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          outputs: [{endAmount:BigNumber.from(0), startAmount:BigNumber.from(-2), recipient:USDC_MAINNET, token:USDC_MAINNET}]
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid startAmount -2\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed outputs: recipient.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          outputs: [{endAmount:BigNumber.from(0), startAmount:BigNumber.from(0), recipient:'0xawful_address', token:USDC_MAINNET}]
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid recipient 0xawful_address\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed outputs: token.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          outputs: [{endAmount:BigNumber.from(0), startAmount:BigNumber.from(0), recipient:USDC_MAINNET, token:'0xworst_token'}]
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid output token 0xworst_token\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed nonce.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          nonce: BigNumber.from(-1)
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid nonce\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed input token.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          input: {
            token: '0xmalicious_token',
            amount: BigNumber.from(1)
          }
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid token\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
    it('Testing invalid parsed input amount.', async () => {
      parseOrderMock.mockReturnValue({
        info: { 
          ...infoMock,
          input: {
            token: USDC_MAINNET,
            amount: BigNumber.from(0)
          }
        },
        hash: () => orderHashMock
      })
      const event = {
        queryStringParameters: {},
        body: JSON.stringify(postRequestBodyMock),
      }
      const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
      expect(postOrderResponse).toEqual({
        body: "{\"errorCode\":\"Invalid amount\",\"id\":\"testRequest\"}",
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Credentials": true,
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      })
    })
  })
})
