import { OrderStreamHandler } from '../../lib/handlers/order-stream/handler'

describe('Testing new order stream handler.', () => {
  // Creating mocks for all the handler dependencies.
  const logInfoMock = jest.fn()
  const logErrorMock = jest.fn()
  const MOCK_ORDER = {
    signature: {
      S: '0xsignature',
    },
    offerer: {
      S: '0xriley',
    },
    orderStatus: {
      S: 'unverified',
    },
    encodedOrder: {
      S: '0xencodedOrder',
    },
    createdAt: {
      N: '1670976836865',
    },
    filler: {
      S: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    orderHash: {
      S: '0x123',
    },
  }
  const getMockRecord = (order: any) => {
    return {
      eventName: 'INSERT',
      dynamodb: {
        Keys: {
          orderHash: {
            S: '0x1',
          },
        },
        NewImage: order,
      },
    }
  }

  const getInjectorPromiseMock = (order: any) => {
    return {
      getContainerInjected: () => {
        return {}
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
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid order.', async () => {
    const orderStreamHandler = new OrderStreamHandler('order-stream', getInjectorPromiseMock(MOCK_ORDER) as any)
    await orderStreamHandler.handler({} as any)
    expect(logInfoMock.mock.calls[0][0].record).toMatchObject(expect.objectContaining(getMockRecord(MOCK_ORDER)))
    expect(logInfoMock.mock.calls[0][1]).toEqual('Success: New order posted to filler webhook.')
  })

  it('Testing invalid order with no whitelisted filler.', async () => {
    const orderStreamHandler = new OrderStreamHandler(
      'order-stream',
      getInjectorPromiseMock({ ...MOCK_ORDER, filler: undefined }) as any
    )
    await orderStreamHandler.handler({} as any)
    expect(logErrorMock.mock.calls[0][0]).toMatchObject({
      e: new Error('There is no filler address for this new record.'),
    })
    expect(logErrorMock.mock.calls[0][1]).toEqual('Error posting new order to filler webhook.')
  })

  it('Testing invalid order with no orderHash.', async () => {
    const orderStreamHandler = new OrderStreamHandler(
      'order-stream',
      getInjectorPromiseMock({ ...MOCK_ORDER, orderHash: undefined }) as any
    )
    await orderStreamHandler.handler({} as any)
    expect(logErrorMock.mock.calls[0][0]).toMatchObject({
      e: new TypeError("Cannot read properties of undefined (reading 'S')"),
    })
    expect(logErrorMock.mock.calls[0][1]).toEqual('Error posting new order to filler webhook.')
  })

  it('Testing udefined Records.', async () => {
    const orderStreamHandler = new OrderStreamHandler('order-stream', {
      getContainerInjected: () => {
        return {}
      },
      getRequestInjected: () => {
        return {
          log: { info: logInfoMock, error: logErrorMock },
          event: undefined,
        }
      },
    } as any)
    await orderStreamHandler.handler({} as any)
    expect(logErrorMock.mock.calls[0][0]).toMatchObject({
      e: new TypeError("Cannot read properties of undefined (reading 'Records')"),
    })
    expect(logErrorMock.mock.calls[0][1]).toEqual('Unexpected error in handler.')
  })
})
