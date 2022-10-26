import { checkOrderStatusLambdaHandler } from './check-order-status/handler'
import { CheckOrderStatusInjector } from './check-order-status/injector'
import { PostOrderHandler } from './post-order/handler'
import { PostOrderInjector } from './post-order/injector'

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('post-orders', postOrderInjectorPromise)

const checkOrderStatusInjectorPromise = new CheckOrderStatusInjector('checkOrderStatusInjector').build()
const checkOrderStatusHandler = new checkOrderStatusLambdaHandler('check-order-status', checkOrderStatusInjectorPromise)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
}
