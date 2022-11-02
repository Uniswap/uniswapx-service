import { ORDER_STATUS } from '../../lib/entities'
import { GetOrdersHandler } from '../../lib/handlers/get-orders/handler'

describe('Testing get orders handler.', () => {
  const MOCK_ORDER = {
    orderHash: '0x1',
    offerer: 'riley.eth',
    encodedOrder: 'order1',
    signature: 'sig1',
    nonce: '1',
    orderStatus: ORDER_STATUS.OPEN,
    sellToken: 'weth',
    offererOrderStatus: `riley.eth-${ORDER_STATUS.OPEN}`,
    offererSellToken: 'riley.eth-weth',
    sellTokenOrderStatus: `weth-${ORDER_STATUS.OPEN}`,
  }
  const getOrdersMock = jest.fn()
  const DB_INTERFACE_MOCK = {
    getOrders: getOrdersMock,
  }
  const REQUEST_INJECTED_MOCK = { limit: 10, queryFilters: { offerer: 'riley.eth' }, requestId: 'id', log: jest.mock }
  const getOrdersHandler = new GetOrdersHandler('get-orders', jest.mock as any)

  it('returns 200 response.', async () => {
    getOrdersMock.mockReturnValue([MOCK_ORDER])
    const getOrdersResponse = await getOrdersHandler.handleRequest({
      requestInjected: REQUEST_INJECTED_MOCK,
      containerInjected: { dbInterface: DB_INTERFACE_MOCK },
    } as any)
    expect(getOrdersMock).toBeCalledWith(REQUEST_INJECTED_MOCK.limit, REQUEST_INJECTED_MOCK.queryFilters)
    expect(getOrdersResponse).toEqual({ body: { orders: [MOCK_ORDER] }, statusCode: 200 })
  })

  it('throws 500 when db interface errors out.', async () => {
    const error = new Error('Oh no! This is an error.')
    getOrdersMock.mockImplementation(() => {
      throw error
    })
    const getOrdersResponse = await getOrdersHandler.handleRequest({
      requestInjected: REQUEST_INJECTED_MOCK,
      containerInjected: { dbInterface: DB_INTERFACE_MOCK },
    } as any)
    expect(getOrdersMock).toBeCalledWith(REQUEST_INJECTED_MOCK.limit, REQUEST_INJECTED_MOCK.queryFilters)
    expect(getOrdersResponse).toEqual({ errorCode: error.message, statusCode: 500 })
  })
})
