import { CheckOrderStatusHandler } from './check-order-status/handler'
import { CheckOrderStatusInjector } from './check-order-status/injector'
import { GetApiDocsJsonHandler } from './get-api-docs-json/handler'
import { GetApiDocsJsonInjector } from './get-api-docs-json/injector'
import { GetNonceHandler } from './get-nonce/handler'
import { GetNonceInjector } from './get-nonce/injector'
import { GetOrdersHandler } from './get-orders/handler'
import { GetOrdersInjector } from './get-orders/injector'
import { OrderStreamHandler } from './order-stream/handler'
import { OrderStreamInjector } from './order-stream/injector'
import { PostOrderHandler } from './post-order/handler'
import { PostOrderInjector } from './post-order/injector'

const getNonceInjectorPromsise = new GetNonceInjector('getNonceInjector').build()
const getNonceHandler = new GetNonceHandler('getNonceHandler', getNonceInjectorPromsise)

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler('getOrdersHandler', getOrdersInjectorPromise)

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('postOrdersHandler', postOrderInjectorPromise)

const checkOrderStatusInjectorPromise = new CheckOrderStatusInjector('checkOrderStatusInjector').build()
const checkOrderStatusHandler = new CheckOrderStatusHandler('checkOrderStatusHandler', checkOrderStatusInjectorPromise)

const getApiDocsJsonInjectorPromise = new GetApiDocsJsonInjector('getApiDocsJsonInjector').build()
const getApiDocsJsonHandler = new GetApiDocsJsonHandler('getApiDocsJsonHandler', getApiDocsJsonInjectorPromise)

const orderStreamInjectorPromise = new OrderStreamInjector('orderStreamInjector').build()
const orderStreamHandler = new OrderStreamHandler('orderStreamHandler', orderStreamInjectorPromise)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
  postOrderHandler: postOrderHandler.handler,
  getNonceHandler: getNonceHandler.handler,
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
  getApiDocsJsonHandler: getApiDocsJsonHandler.handler,
  orderStreamHandler: orderStreamHandler.handler,
}
