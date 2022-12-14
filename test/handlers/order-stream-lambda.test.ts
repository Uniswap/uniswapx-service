import axios from 'axios'
import { OrderStreamHandler } from '../../lib/handlers/order-stream/handler'
import * as errorUtil from '../../lib/util/errors'

jest.mock('axios')

describe('Testing new order stream handler.', () => {
  // Creating mocks for all the handler dependencies.
  const mockedAxios = axios as jest.Mocked<typeof axios>
  const errorSpy = jest.spyOn(errorUtil, 'logAndThrowError')
  mockedAxios.post.mockReturnValue(Promise.resolve({ status: 201 }))
  errorSpy.mockImplementation()

  const logInfoMock = jest.fn()
  const logErrorMock = jest.fn()
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
    await orderStreamHandler.handler({
      Records: [getMockRecord(MOCK_ORDER)],
    } as any)
    expect(mockedAxios.post).toBeCalledWith('https://jsonplaceholder.typicode.com/posts', {
      orderHash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3',
      createdAt: '1670976836865',
      signature:
        '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
      offerer: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      orderStatus: 'unverified',
      encodedOrder: '0x00000000001325ad66ad5fa02621d3ad52c9323c6c2bff26820000000',
    })
    expect(logInfoMock.mock.calls[0][0].record).toMatchObject(expect.objectContaining(getMockRecord(MOCK_ORDER)))
    expect(logInfoMock.mock.calls[0][1]).toEqual('Success: New order sent to filler webhook.')
  })

  it('Testing invalid order with no whitelisted filler.', async () => {
    const orderStreamHandler = new OrderStreamHandler(
      'order-stream',
      getInjectorPromiseMock({ ...MOCK_ORDER, filler: undefined }) as any
    )
    await orderStreamHandler.handler({
      Records: [getMockRecord(MOCK_ORDER)],
    } as any)
    expect(errorSpy).toBeCalledWith(
      {
        errorCode: 'There is no valid filler address for this new record.',
      },
      'Error sending new order to filler.',
      { info: logInfoMock, error: logErrorMock }
    )
  })

  it('Testing invalid order with no orderHash.', async () => {
    const orderStreamHandler = new OrderStreamHandler(
      'order-stream',
      getInjectorPromiseMock({ ...MOCK_ORDER, orderHash: undefined }) as any
    )
    await orderStreamHandler.handler({
      Records: [getMockRecord(MOCK_ORDER)],
    } as any)
    expect(errorSpy).toBeCalledWith(
      {
        errorCode: "Cannot read properties of undefined (reading 'S')",
      },
      'Error sending new order to filler.',
      { info: logInfoMock, error: logErrorMock }
    )
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
    await orderStreamHandler.handler({
      Records: [getMockRecord(MOCK_ORDER)],
    } as any)
    expect(errorSpy).toBeCalledWith(
      {
        errorCode: "Cannot read properties of undefined (reading 'Records')",
      },
      'Unexpected error in handler.',
      { info: logInfoMock, error: logErrorMock }
    )
  })

  it('Testing no records validation error.', async () => {
    const orderStreamHandler = new OrderStreamHandler('order-stream', getInjectorPromiseMock(MOCK_ORDER) as any)
    expect(async () => await orderStreamHandler.handler({} as any)).rejects.toThrow(
      errorUtil.DynamoStreamInputValidationError
    )
  })

  it('Testing network error from market maker.', async () => {
    mockedAxios.post.mockReturnValue(Promise.resolve({ status: 500 }))
    const orderStreamHandler = new OrderStreamHandler('order-stream', getInjectorPromiseMock(MOCK_ORDER) as any)
    await orderStreamHandler.handler({
      Records: [getMockRecord(MOCK_ORDER)],
    } as any)
    expect(errorSpy).toBeCalledWith(
      {
        errorCode: 'Order recipient did not return an OK status.',
      },
      'Error sending new order to filler.',
      { info: logInfoMock, error: logErrorMock }
    )
  })
})
