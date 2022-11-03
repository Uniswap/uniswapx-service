import { GetOrdersHandler } from './get-orders/handler'
import { GetOrdersInjector } from './get-orders/injector'
import { PostOrderHandler } from './post-order/handler'
import { PostOrderInjector } from './post-order/injector'

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler('get-orders', getOrdersInjectorPromise)

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('post-orders', postOrderInjectorPromise)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
  postOrderHandler: postOrderHandler.handler,
}
