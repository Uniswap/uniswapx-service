import { GetOrdersHandler } from '../../lib/handlers/get-orders/handler'

describe('Testing get orders handler.', () => {
  it('returns 200 response.', async () => {
    const getOrdersHandler = new GetOrdersHandler('get-orders', jest.mock as any)
    console.log('getOrdersHandler: ', getOrdersHandler)
  })
})
