import { PostOrderHandler } from './post-order/handler'
import { PostOrderInjector } from './post-order/injector'

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('post-orders', postOrderInjectorPromise)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
