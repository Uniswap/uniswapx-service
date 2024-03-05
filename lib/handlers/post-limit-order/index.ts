import { AnalyticsService } from '../../services/analytics-service'
import { PostOrderHandler } from '../post-order/handler'
import { PostLimitOrderInjector } from './injector'

const postLimitOrderInjectorPromise = new PostLimitOrderInjector('postLimitOrderInjector').build()
const postLimitOrderHandler = new PostOrderHandler(
  'postLimitOrdersHandler',
  postLimitOrderInjectorPromise,
  AnalyticsService.create()
)

module.exports = {
  postLimitOrderHandler: postLimitOrderHandler.handler,
}
