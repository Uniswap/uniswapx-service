import { GetOrdersHandler } from '../../lib/handlers/get-orders/handler'
import { MOCK_ORDER_1 } from '../../lib/testing/order-mocks'

describe('Testing get orders handler.', () => {
  const getOrdersMock = jest.fn()
  const dbInterfaceMock = {
    getOrders: getOrdersMock,
  }
  const requestInjectedMock = {
    limit: 10,
    queryFilters: { offerer: MOCK_ORDER_1.offerer },
  }
  const getOrdersHandler = new GetOrdersHandler('get-orders', jest.mock as any)

  it('Returns request body and 200 status code.', async () => {
    getOrdersMock.mockReturnValue([MOCK_ORDER_1])
    const getOrdersResponse = await getOrdersHandler.handleRequest({
      requestInjected: requestInjectedMock,
      containerInjected: { dbInterface: dbInterfaceMock },
    } as any)
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters)
    expect(getOrdersResponse).toEqual({ body: { orders: [MOCK_ORDER_1] }, statusCode: 200 })
  })

  it('Throws 500 when db interface errors out.', async () => {
    const error = new Error('Oh no! This is an error.')
    getOrdersMock.mockImplementation(() => {
      throw error
    })
    const getOrdersResponse = await getOrdersHandler.handleRequest({
      requestInjected: requestInjectedMock,
      containerInjected: { dbInterface: dbInterfaceMock },
    } as any)
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters)
    expect(getOrdersResponse).toEqual({ errorCode: error.message, statusCode: 500 })
  })
})
