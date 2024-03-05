import { CheckOrderStatusHandler } from './handler'
import { CheckOrderStatusInjector } from './injector'

const checkOrderStatusInjectorPromise = new CheckOrderStatusInjector('checkOrderStatusInjector').build()
const checkOrderStatusHandler = new CheckOrderStatusHandler('checkOrderStatusHandler', checkOrderStatusInjectorPromise)

module.exports = {
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
}
