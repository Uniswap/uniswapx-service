import { Logger } from '@aws-lambda-powertools/logger'
import { OrderValidator } from '@uniswap/uniswapx-sdk'
import bunyan from 'bunyan'
import { mock } from 'jest-mock-extended'
import { UniswapXOrderEntity } from '../../../lib/entities'
import { ApiInjector, ApiRInj } from '../../../lib/handlers/base'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { getMaxLimitOpenOrders, PostLimitOrderInjector } from '../../../lib/handlers/post-limit-order/injector'
import { PostOrderHandler } from '../../../lib/handlers/post-order/handler'
import { getMaxOpenOrders, PostOrderInjector } from '../../../lib/handlers/post-order/injector'
import { PostOrderBodyParser } from '../../../lib/handlers/post-order/PostOrderBodyParser'
import { LIMIT_ORDER_ROUTE, PostOrderRoute } from '../../../lib/handlers/post-order/routes'
import { PostOrderRequestBody } from '../../../lib/handlers/post-order/schema'
import { ProviderMap } from '../../../lib/handlers/shared'
import { ContainerInjected as PostContainerInjected } from '../../../lib/handlers/shared/post'
import { WebhookProvider } from '../../../lib/providers/base'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { RecordingAnalytics } from '../../fakes/analytics'
import { FakeCosigner } from '../../fakes/cosigner'
import { FakeOffChainValidator, FakeOnChainValidator } from '../../fakes/order-validators'
import { FakeOrdersRepository } from '../../fakes/orders-repository'
import { RecordingStartTracking } from '../../fakes/start-tracking'
import { MOCK_PROVIDER_MAP } from '../fixtures'

// The requestId every handler built here reports in its error bodies.
export const TEST_REQUEST_ID = 'testRequest'

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
  service: UniswapXOrderService
  orderValidator: FakeOffChainValidator
  onChainValidator: FakeOnChainValidator
  repository: R
  analytics: RecordingAnalytics
  logger: Logger
  cosigner: FakeCosigner
  tracking: RecordingStartTracking
}

export type PostOrderHandlerHarness<R extends OrdersRepository = FakeOrdersRepository> = PostOrderServiceHarness<R> & {
  handler: PostOrderHandler
}

export type PostOrderHandlerOverrides<R extends OrdersRepository = FakeOrdersRepository> =
  PostOrderServiceOverrides<R> & {
    // 'lambda' wires the route's own injector, which installs the request's metrics logger as the
    // global one and takes the requestId from the Lambda context; 'fixed' (the default) does neither.
    injector?: 'fixed' | 'lambda'
  }

/**
 * The order service as the post path uses it, every dependency a fake. The test file must
 * jest.mock lib/handlers/shared/sfn (see RecordingStartTracking).
 */
export function makePostOrderService<R extends OrdersRepository = FakeOrdersRepository>(
  overrides: PostOrderServiceOverrides<R> = {}
): PostOrderServiceHarness<R> {
  const orderValidator = overrides.orderValidator ?? new FakeOffChainValidator()
  const onChainValidator = overrides.onChainValidator ?? new FakeOnChainValidator()
  // R defaults to FakeOrdersRepository, so the fallback is an R whenever none is passed
  const repository = overrides.repository ?? (new FakeOrdersRepository() as OrdersRepository as R)
  const analytics = overrides.analytics ?? new RecordingAnalytics()
  const logger = overrides.logger ?? mock<Logger>()

  const service = new UniswapXOrderService(
    orderValidator,
    new OnChainValidatorMap<OrderValidator>([], () => onChainValidator),
    repository,
    // the limit repository is read only by GET /limit-orders
    new FakeOrdersRepository(),
    logger,
    overrides.getMaxOpenOrders ?? getMaxOpenOrders,
    analytics,
    overrides.providerMap ?? MOCK_PROVIDER_MAP,
    overrides.webhookProvider
  )

  return {
    service,
    orderValidator,
    onChainValidator,
    repository,
    analytics,
    logger,
    cosigner: new FakeCosigner(),
    tracking: new RecordingStartTracking(),
  }
}

/** A post handler for `route`, wired as that route's Lambda wires it, over makePostOrderService. */
export function makePostOrderHandler<R extends OrdersRepository = FakeOrdersRepository>(
  route: PostOrderRoute,
  { injector = 'fixed', ...overrides }: PostOrderHandlerOverrides<R> = {}
): PostOrderHandlerHarness<R> {
  const isLimitRoute = route === LIMIT_ORDER_ROUTE
  const harness = makePostOrderService<R>({
    getMaxOpenOrders: isLimitRoute ? getMaxLimitOpenOrders : getMaxOpenOrders,
    ...overrides,
  })
  const lambdaInjector = isLimitRoute
    ? new PostLimitOrderInjector('postLimitOrderInjector')
    : new PostOrderInjector('postOrderInjector')
  const handler = new PostOrderHandler(
    isLimitRoute ? 'post-limit-order' : 'post-order',
    (injector === 'lambda' ? lambdaInjector : new FixedRequestInjector()).build(),
    harness.service,
    new PostOrderBodyParser(harness.logger),
    route
  )
  return { ...harness, handler }
}

class FixedRequestInjector extends ApiInjector<PostContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  constructor() {
    super('post-order-test-injector')
  }

  protected async buildContainerInjected(): Promise<PostContainerInjected> {
    return {}
  }

  public async getRequestInjected(): Promise<ApiRInj> {
    return {
      requestId: TEST_REQUEST_ID,
      log: bunyan.createLogger({ name: 'post-order-test', level: bunyan.FATAL + 1 }),
    }
  }
}
