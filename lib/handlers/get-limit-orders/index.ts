import { GetOrdersHandler } from '../get-orders/handler'
import { GetLimitOrdersInjector } from './injector'

const getLimitOrdersInjectorPromise = new GetLimitOrdersInjector('getLimitOrdersInjector').build()
const getLimitOrdersHandler = new GetOrdersHandler('getLimitOrdersHandler', getLimitOrdersInjectorPromise)

module.exports = {
  getLimitOrdersHandler: getLimitOrdersHandler.handler,
}
