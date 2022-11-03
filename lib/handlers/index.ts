import { GetOrdersHandler } from './get-orders/handler'
import { GetOrdersInjector } from './get-orders/injector'

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler('get-orders', getOrdersInjectorPromise)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
}
