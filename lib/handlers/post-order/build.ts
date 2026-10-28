import { Logger } from '@aws-lambda-powertools/logger'
import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../../entities'
import { WebhookProvider } from '../../providers/base'
import { BaseOrdersRepository } from '../../repositories/base'
import { AnalyticsServiceInterface } from '../../services/analytics-service'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
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
  logger: Logger
  analytics: AnalyticsServiceInterface
  providerMap: ProviderMap
  // Only used where the policy notifies the exclusive filler.
  webhookProvider?: WebhookProvider
}

export function buildPostOrderService(policy: PostRoutePolicy, deps: PostOrderDeps): UniswapXOrderService {
  return new UniswapXOrderService(
    deps.orderValidator,
    deps.onChainValidatorMap,
    deps.repository,
    // the limit repository is read only by GET /limit-orders
    deps.repository,
    deps.logger,
    policy.getMaxOpenOrders,
    deps.analytics,
    deps.providerMap,
    policy.notifyExclusiveFiller ? deps.webhookProvider : undefined
  )
}

export function buildPostOrderHandler(policy: PostRoutePolicy, deps: PostOrderDeps): PostOrderHandler {
  return new PostOrderHandler(
    policy.handlerName,
    buildPostOrderService(policy, deps),
    new PostOrderBodyParser(),
    policy.route
  )
}
