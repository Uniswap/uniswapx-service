import { AnalyticsService } from '../../services/analytics-service'
import { PostOrderHandler } from './handler'
import { PostOrderInjector } from './injector'

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('postOrdersHandler', postOrderInjectorPromise, AnalyticsService.create())

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
