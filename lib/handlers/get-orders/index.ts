import { GetOrdersHandler } from './handler'
import { GetOrdersInjector } from './injector'

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler('getOrdersHandler', getOrdersInjectorPromise)
module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
}
