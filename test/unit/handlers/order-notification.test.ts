import axios from 'axios'
import {
  OrderNotificationHandler,
  sendImmediateExclusiveFillerNotification,
  sendWebhookNotifications,
} from '../../../lib/handlers/order-notification/handler'
import { ExclusiveFillerWebhookOrder, WebhookOrderData } from '../../../lib/handlers/order-notification/types'

jest.mock('axios')
jest.mock('@uniswap/uniswapx-sdk')

describe('Testing new order Notification handler.', () => {
  // Creating mocks for all the handler dependencies.
  const mockedAxios = axios as jest.Mocked<typeof axios>
  mockedAxios.post.mockReturnValue(Promise.resolve({ status: 201 }))

  const getEndpointsMock = jest.fn()
  getEndpointsMock.mockImplementation(() => Promise.resolve(mockWebhooks))

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
      S: 'open',
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
    expect(logInfoMock).toBeCalledTimes(3)
    expect(logInfoMock).toBeCalledWith(
      { result: { status: 200 } },
      'Success: New order record sent to registered webhook webhook.com/1.'
    )
    expect(logInfoMock).toBeCalledWith(
      { result: { status: 200 } },
      'Success: New order record sent to registered webhook webhook.com/2.'
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

  it('Testing failed webhook notification 5xx.', async () => {
    const failedResponse = { status: 500 }
    mockedAxios.post.mockReturnValue(Promise.reject(failedResponse))
    const response = await orderNotificationHandler()
    expect(getEndpointsMock).toBeCalledWith({
      offerer: MOCK_ORDER.offerer.S,
      orderStatus: MOCK_ORDER.orderStatus.S,
      filler: MOCK_ORDER.filler.S,
    })
    expect(logErrorMock).toBeCalledWith(
      {
        failedWebhooks: ['webhook.com/1', 'webhook.com/2'],
      },
      'Error: Failed to notify registered webhooks.'
    )
    expect(response).toMatchObject({ batchItemFailures: [] })
  })

  it('Testing failed webhook notification 4xx.', async () => {
    const failedResponse = { status: 400 }
    mockedAxios.post.mockReturnValue(Promise.reject(failedResponse))
    const response = await orderNotificationHandler()
    expect(getEndpointsMock).toBeCalledWith({
      offerer: MOCK_ORDER.offerer.S,
      orderStatus: MOCK_ORDER.orderStatus.S,
      filler: MOCK_ORDER.filler.S,
    })
    expect(logErrorMock).toBeCalledWith(
      {
        failedWebhooks: ['webhook.com/1', 'webhook.com/2'],
      },
      'Error: Failed to notify registered webhooks.'
    )
    expect(response).toMatchObject({ batchItemFailures: [] })
  })

  it('Testing no new order check.', async () => {
    const response = await orderNotificationHandler(null)
    expect(logErrorMock).toBeCalledWith('There is no new order.', 'Unexpected failure in handler.')
    expect(response).toMatchObject({ batchItemFailures: [{ itemIdentifier: 1 }] })
  })

  it('Testing no records validation error.', async () => {
    await expect(async () => await orderNotificationHandler(MOCK_ORDER, {})).rejects.toThrow(Error)
  })
})

describe('sendWebhookNotifications', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const mockEndpoints = [
    { url: 'https://webhook1.com' },
    { url: 'https://webhook2.com', headers: { Authorization: 'Bearer token' } },
  ]

  const mockOrder: WebhookOrderData = {
    orderHash: '0x123',
    createdAt: 1670976836865,
    signature: '0xsig',
    offerer: '0xswapper',
    orderStatus: 'open',
    encodedOrder: '0xencodedorder',
    chainId: 1,
    orderType: 'Dutch_V2',
    filler: '0xfiller',
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should send webhooks to all endpoints', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 })

    await sendWebhookNotifications(mockEndpoints, mockOrder, mockLogger)

    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://webhook1.com',
      expect.objectContaining({
        orderHash: '0x123',
        offerer: '0xswapper',
        filler: '0xfiller',
        type: 'Dutch_V2',
      }),
      expect.objectContaining({ timeout: 200 })
    )
    expect(mockLogger.info).toHaveBeenCalledTimes(2)
  })

  it('should handle webhook failures gracefully', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'))

    await sendWebhookNotifications(mockEndpoints, mockOrder, mockLogger)

    expect(mockLogger.error).toHaveBeenCalledWith(
      { failedWebhooks: ['https://webhook1.com', 'https://webhook2.com'] },
      'Error: Failed to notify registered webhooks.'
    )
  })
})

describe('sendImmediateExclusiveFillerNotification', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>
  const mockWebhookProvider = {
    getEndpoints: jest.fn(),
    getExclusiveFillerEndpoints: jest.fn(),
  }
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const mockOrderEntity: ExclusiveFillerWebhookOrder = {
    orderHash: '0x123',
    createdAt: 1670976836865,
    signature: '0xsig',
    offerer: '0xswapper',
    orderStatus: 'open',
    encodedOrder: '0xencodedorder',
    chainId: 1,
    filler: '0xfiller',
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should send immediate notification to exclusive filler', async () => {
    const mockEndpoints = [{ url: 'https://filler-webhook.com' }]
    mockWebhookProvider.getExclusiveFillerEndpoints.mockResolvedValue(mockEndpoints)
    mockedAxios.post.mockResolvedValue({ status: 200 })

    await sendImmediateExclusiveFillerNotification(mockOrderEntity, 'Dutch_V2', mockWebhookProvider, mockLogger)

    expect(mockWebhookProvider.getExclusiveFillerEndpoints).toHaveBeenCalledWith('0xfiller')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://filler-webhook.com',
      expect.objectContaining({
        orderHash: '0x123',
        filler: '0xfiller',
        offerer: '0xswapper',
      }),
      expect.any(Object)
    )
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('should skip notification when no endpoints found', async () => {
    mockWebhookProvider.getExclusiveFillerEndpoints.mockResolvedValue([])

    await sendImmediateExclusiveFillerNotification(mockOrderEntity, 'Dutch_V2', mockWebhookProvider, mockLogger)

    expect(mockWebhookProvider.getExclusiveFillerEndpoints).toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('should handle webhook provider errors gracefully', async () => {
    mockWebhookProvider.getExclusiveFillerEndpoints.mockRejectedValue(new Error('S3 error'))

    await sendImmediateExclusiveFillerNotification(mockOrderEntity, 'Dutch_V2', mockWebhookProvider, mockLogger)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        orderHash: '0x123',
        filler: '0xfiller',
        error: expect.any(Error),
      }),
      'Failed to send immediate webhook notification to exclusive filler'
    )
  })
})
