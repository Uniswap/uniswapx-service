import { OrderNotificationHandler } from './handler'
import { OrderNotificationInjector } from './injector'

const orderNotificationInjectorPromise = new OrderNotificationInjector('orderNotificationInjector').build()
const orderNotificationHandler = new OrderNotificationHandler(
  'orderNotificationHandler',
  orderNotificationInjectorPromise
)

module.exports = {
  orderNotificationHandler: orderNotificationHandler.handler,
}
