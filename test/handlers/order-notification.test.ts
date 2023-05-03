import axios from 'axios'
import { OrderNotificationHandler } from '../../lib/handlers/order-notification/handler'

jest.mock('axios')

describe('Testing new order Notification handler.', () => {
  // Creating mocks for all the handler dependencies.
  const mockedAxios = axios as jest.Mocked<typeof axios>
  mockedAxios.post.mockReturnValue(Promise.resolve({ status: 201 }))

  const getEndpointsMock = jest.fn()
  getEndpointsMock.mockImplementation(() => mockWebhooks)

  const logInfoMock = jest.fn()
  const logErrorMock = jest.fn()

  const mockWebhooks = [{ url: 'webhook.com/1' }, { url: 'webhook.com/2' }]

  const MOCK_ORDER = {
    signature: {
      S: '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    },
    offerer: {
      S: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    orderStatus: {
      S: 'unverified',
    },
    encodedOrder: {
      S: '0x00000000001325ad66ad5fa02621d3ad52c9323c6c2bff26820000000',
    },
    createdAt: {
      N: '1670976836865',
    },
    filler: {
      S: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    orderHash: {
      S: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3',
    },
    chainId: {
      N: '1',
    },
  }
  const getMockRecord = (order: any) => {
    return {
      eventName: 'INSERT',
      dynamodb: {
        SequenceNumber: 1,
        Keys: {
          orderHash: {
            S: '0x1',
          },
        },
        NewImage: order,
      },
    }
  }

  const orderNotificationHandler = async (
    order: any = MOCK_ORDER,
    event: any = {
      Records: [getMockRecord(MOCK_ORDER)],
    }
  ) => {
    const injectedMock = {
      getContainerInjected: () => {
        return { webhookProvider: { getEndpoints: getEndpointsMock } }
      },
      getRequestInjected: () => {
        return {
          log: { info: logInfoMock, error: logErrorMock },
          event: {
            Records: [getMockRecord(order)],
          },
        }
      },
    }
    const orderNotificationHandler = new OrderNotificationHandler('orderNotification', injectedMock as any)
    return await orderNotificationHandler.handler(event as any)
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid order.', async () => {
    mockedAxios.post.mockReturnValue(Promise.resolve({ status: 200 }))
    const response = await orderNotificationHandler()
    expect(getEndpointsMock).toBeCalledWith({
      offerer: MOCK_ORDER.offerer.S,
      orderStatus: MOCK_ORDER.orderStatus.S,
      filler: MOCK_ORDER.filler.S,
    })
    expect(logInfoMock).toBeCalledTimes(2)
    expect(logInfoMock).toBeCalledWith(
      { result: { status: 200 } },
      'Success: New order record sent to registered webhook.'
    )
    expect(response).toMatchObject({ batchItemFailures: [] })
  })

  it('Testing invalid order with no order hash.', async () => {
    await orderNotificationHandler({ ...MOCK_ORDER, orderHash: undefined })
    expect(logErrorMock).toBeCalledWith(
      "Error parsing new record to order: Cannot read properties of undefined (reading 'S')",
      'Unexpected failure in handler.'
    )
  })

  it('Testing failed webhook notification.', async () => {
    const failedResponse = { status: 500 }
    mockedAxios.post.mockReturnValue(Promise.resolve(failedResponse))
    const response = await orderNotificationHandler()
    expect(getEndpointsMock).toBeCalledWith({
      offerer: MOCK_ORDER.offerer.S,
      orderStatus: MOCK_ORDER.orderStatus.S,
      filler: MOCK_ORDER.filler.S,
    })
    expect(logErrorMock).toBeCalledWith(
      {
        failedRequests: [
          { status: 'fulfilled', value: failedResponse },
          { status: 'fulfilled', value: failedResponse },
        ],
      },
      'Error: Failed to notify registered webhooks.'
    )
    expect(response).toMatchObject({ batchItemFailures: [{ itemIdentifier: 1 }] })
  })

  it('Testing no new order check.', async () => {
    const response = await orderNotificationHandler(null)
    expect(logErrorMock).toBeCalledWith('There is no new order.', 'Unexpected failure in handler.')
    expect(response).toMatchObject({ batchItemFailures: [{ itemIdentifier: 1 }] })
  })

  it('Testing no records validation error.', async () => {
    expect(async () => await orderNotificationHandler(MOCK_ORDER, {})).rejects.toThrow(Error)
  })
})
