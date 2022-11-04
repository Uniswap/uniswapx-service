import { PostOrderHandler } from '../../lib/handlers/post-order/handler'

describe('Testing post order handler.', () => {
  // Creating mocks for all the handler dependencies.
  const postOrderMock = jest.fn()
  const mockEncodedOrder = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f0000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000006364432c0000000000000000000000000000000000000000000000000000000063644200000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000e4e1c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000000000000000000000000000ac2d18f78e5c8000000000000000000000000000000000000000000000000000a8c0ff92d4c00000000000000000000000000000eaf1c41339f7d33a2c47f82f7b9309b5cbc83b5f'
  const postRequestBodyMock = {
    encodedOrder: mockEncodedOrder,
    signature: '0xd3ed296bc55f59105abfd47566f65d2984dab6a49deac772d9c33d047c9952272642a5131f37ba8766db78b3302f939079c702e5627ea1d80a8a9d8cf54c5f8a1c',
    chainId: 1
  }
  const requestInjectedMock = {
    deadline: 1667517713,
    offerer: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    sellAmount: '14000000',
    reactor: '0xE9781560d93c27aa4C4F3543631d191D10608d20',
    startTime: 1667276283251,
    nonce: '25',
    orderHash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4',
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
            putOrderAndUpdateNonceTransaction: ()=> postOrderMock,
        }
      }
    },
    getRequestInjected: ()=> requestInjectedMock,
  }
  const event = {
    queryStringParameters: {},
    body: postRequestBodyMock,
  }

  const postOrderHandler = new PostOrderHandler('post-order', injectorPromiseMock)

  beforeAll(async () => {
    postOrderMock.mockReturnValue(requestInjectedMock.orderHash)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response.', async () => {
    const postOrderResponse = await postOrderHandler.handler(event as any, {} as any)
    expect(postOrderMock).toBeCalledWith(requestInjectedMock)
    expect(postOrderResponse).toEqual({
      body: JSON.stringify({ hash: requestInjectedMock.orderHash }),
      statusCode: 200,
      headers: expect.anything(),
    })
  })
})