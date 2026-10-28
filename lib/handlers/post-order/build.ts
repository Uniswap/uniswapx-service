import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../../entities'
import { PriorityCosigner } from '../../models/PriorityOrder'
import { WebhookProvider } from '../../providers/base'
import { BaseOrdersRepository } from '../../repositories/base'
import { AnalyticsServiceInterface } from '../../services/analytics-service'
import { ExclusiveFillerNotifier, OrderPoster } from '../../services/OrderPoster'
import { StartTracking } from '../../services/start-tracking'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { sendImmediateExclusiveFillerNotification } from '../order-notification/handler'
import type { ProviderMap } from '../shared'
import { PostOrderHandler } from './handler'
import { PostRoutePolicy } from './policy'
import { PostOrderBodyParser } from './PostOrderBodyParser'

// What a post Lambda is built from besides its policy: built from the environment in
// lambda.ts, from fakes in tests.
export type PostOrderDeps = {
  orderValidator: OffChainUniswapXOrderValidator
  onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>
  repository: BaseOrdersRepository<UniswapXOrderEntity>
  analytics: AnalyticsServiceInterface
  providerMap: ProviderMap
  startTracking: StartTracking
  createPriorityCosigner: () => PriorityCosigner
  // Epoch milliseconds.
  now: () => number
  // Only used where the policy notifies the exclusive filler.
  webhookProvider?: WebhookProvider
}

export function buildPostOrderService(policy: PostRoutePolicy, deps: PostOrderDeps): OrderPoster {
  const { webhookProvider, ...posterDeps } = deps
  return new OrderPoster({
    ...posterDeps,
    getMaxOpenOrders: policy.getMaxOpenOrders,
    notifyExclusiveFiller:
      policy.notifyExclusiveFiller && webhookProvider ? exclusiveFillerNotifier(webhookProvider) : undefined,
  })
}

export function buildPostOrderHandler(policy: PostRoutePolicy, deps: PostOrderDeps): PostOrderHandler {
  return new PostOrderHandler(
    policy.handlerName,
    buildPostOrderService(policy, deps),
    new PostOrderBodyParser(),
    policy.route
  )
}

function exclusiveFillerNotifier(webhookProvider: WebhookProvider): ExclusiveFillerNotifier {
  return (order, orderType, logger) =>
    sendImmediateExclusiveFillerNotification(order, orderType, webhookProvider, logger)
}
