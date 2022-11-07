import { GetNonceHandler } from './get-nonce/handler'
import { GetNonceInjector } from './get-nonce/injector'
import { GetOrdersHandler } from './get-orders/handler'
import { GetOrdersInjector } from './get-orders/injector'

const getNonceInjectorPromsise = new GetNonceInjector('getNonceInjector').build()
const getNonceHandler = new GetNonceHandler('get-nonce', getNonceInjectorPromsise)

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler('get-orders', getOrdersInjectorPromise)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
  getNonceHandler: getNonceHandler.handler,
}
