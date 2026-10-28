import { Logger } from '@aws-lambda-powertools/logger'
import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { UniswapXOrderEntity } from '../../../lib/entities'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { buildPostOrderHandler, buildPostOrderService, PostOrderDeps } from '../../../lib/handlers/post-order/build'
import { PostOrderHandler } from '../../../lib/handlers/post-order/handler'
import { DUTCH_POST_POLICY, LIMIT_POST_POLICY, PostRoutePolicy } from '../../../lib/handlers/post-order/policy'
import { LIMIT_ORDER_ROUTE, PostOrderRoute } from '../../../lib/handlers/post-order/routes'
import { ProviderMap } from '../../../lib/handlers/shared'
import { WebhookProvider } from '../../../lib/providers/base'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { OrderPoster } from '../../../lib/services/OrderPoster'
import { RecordingAnalytics } from '../../fakes/analytics'
import { FakeCosigner } from '../../fakes/cosigner'
import { FakeOffChainValidator, FakeOnChainValidator } from '../../fakes/order-validators'
import { FakeOrdersRepository } from '../../fakes/orders-repository'
import { RecordingStartTracking } from '../../fakes/start-tracking'
import { MOCK_PROVIDER_MAP } from '../fixtures'

type OrdersRepository = BaseOrdersRepository<UniswapXOrderEntity>

export type PostOrderServiceOverrides<R extends OrdersRepository = FakeOrdersRepository> = {
  orderValidator?: FakeOffChainValidator
  onChainValidator?: FakeOnChainValidator
  // A real repository (e.g. on DynamoDB Local) in place of the fake.
  repository?: R
  analytics?: RecordingAnalytics
  logger?: Logger
  getMaxOpenOrders?: (offerer: string) => number
  providerMap?: ProviderMap
  webhookProvider?: WebhookProvider
}

export type PostOrderServiceHarness<R extends OrdersRepository = FakeOrdersRepository> = {
  service: OrderPoster
  orderValidator: FakeOffChainValidator
  onChainValidator: FakeOnChainValidator
  repository: R
  analytics: RecordingAnalytics
  logger: Logger
  cosigner: FakeCosigner
  tracking: RecordingStartTracking
}

export type PostOrderHandlerHarness<R extends OrdersRepository = FakeOrdersRepository> = Omit<
  PostOrderServiceHarness<R>,
  'service'
> & {
  handler: PostOrderHandler
}

type PostPathFakes<R extends OrdersRepository> = Omit<PostOrderServiceHarness<R>, 'service'> & {
  policy: PostRoutePolicy
  deps: PostOrderDeps
}

// The post Lambda's deps, every one a fake unless overridden, and its policy with any
// getMaxOpenOrders override applied.
function postPathFakes<R extends OrdersRepository>(
  policy: PostRoutePolicy,
  overrides: PostOrderServiceOverrides<R>
): PostPathFakes<R> {
  const orderValidator = overrides.orderValidator ?? new FakeOffChainValidator()
  const onChainValidator = overrides.onChainValidator ?? new FakeOnChainValidator()
  // R defaults to FakeOrdersRepository, so the fallback is an R whenever none is passed
  const repository = overrides.repository ?? (new FakeOrdersRepository() as OrdersRepository as R)
  const analytics = overrides.analytics ?? new RecordingAnalytics()
  const logger = overrides.logger ?? mock<Logger>()

  return {
    policy: { ...policy, getMaxOpenOrders: overrides.getMaxOpenOrders ?? policy.getMaxOpenOrders },
    deps: {
      orderValidator,
      onChainValidatorMap: new OnChainValidatorMap<OrderValidator>([], () => onChainValidator),
      repository,
      logger,
      analytics,
      providerMap: overrides.providerMap ?? MOCK_PROVIDER_MAP,
      webhookProvider: overrides.webhookProvider,
    },
    orderValidator,
    onChainValidator,
    repository,
    analytics,
    logger,
    cosigner: new FakeCosigner(),
    tracking: new RecordingStartTracking(),
  }
}

/**
 * The order service as the Dutch post Lambda builds it, every dependency a fake. The test
 * file must jest.mock lib/handlers/shared/sfn (see RecordingStartTracking).
 */
export function makePostOrderService<R extends OrdersRepository = FakeOrdersRepository>(
  overrides: PostOrderServiceOverrides<R> = {}
): PostOrderServiceHarness<R> {
  const { policy, deps, ...harness } = postPathFakes(DUTCH_POST_POLICY, overrides)
  return { ...harness, service: buildPostOrderService(policy, deps) }
}

/** The post handler for `route`, built by the same builder as that route's Lambda, over fakes. */
export function makePostOrderHandler<R extends OrdersRepository = FakeOrdersRepository>(
  route: PostOrderRoute,
  overrides: PostOrderServiceOverrides<R> = {}
): PostOrderHandlerHarness<R> {
  const { policy, deps, ...harness } = postPathFakes(
    route === LIMIT_ORDER_ROUTE ? LIMIT_POST_POLICY : DUTCH_POST_POLICY,
    overrides
  )
  return { ...harness, handler: buildPostOrderHandler(policy, deps) }
}
