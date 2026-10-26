import { Logger } from '@aws-lambda-powertools/logger'
import { OrderValidator } from '@uniswap/uniswapx-sdk'
import bunyan from 'bunyan'
import { mock } from 'jest-mock-extended'
import { ApiInjector, ApiRInj } from '../../../lib/handlers/base'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { getMaxLimitOpenOrders } from '../../../lib/handlers/post-limit-order/injector'
import { PostOrderHandler } from '../../../lib/handlers/post-order/handler'
import { getMaxOpenOrders } from '../../../lib/handlers/post-order/injector'
import { PostOrderBodyParser } from '../../../lib/handlers/post-order/PostOrderBodyParser'
import { LIMIT_ORDER_ROUTE, PostOrderRoute } from '../../../lib/handlers/post-order/routes'
import { PostOrderRequestBody } from '../../../lib/handlers/post-order/schema'
import { ProviderMap } from '../../../lib/handlers/shared'
import { ContainerInjected as PostContainerInjected } from '../../../lib/handlers/shared/post'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { RecordingAnalytics } from '../../fakes/analytics'
import { FakeCosigner } from '../../fakes/cosigner'
import { FakeOffChainValidator, FakeOnChainValidator } from '../../fakes/order-validators'
import { FakeOrdersRepository } from '../../fakes/orders-repository'
import { RecordingStartTracking } from '../../fakes/start-tracking'
import { MOCK_PROVIDER_MAP } from '../fixtures'

// The requestId every handler built here reports in its error bodies.
export const TEST_REQUEST_ID = 'testRequest'

export type PostOrderServiceOverrides = {
  orderValidator?: FakeOffChainValidator
  onChainValidator?: FakeOnChainValidator
  repository?: FakeOrdersRepository
  analytics?: RecordingAnalytics
  logger?: Logger
  getMaxOpenOrders?: (offerer: string) => number
  providerMap?: ProviderMap
}

export type PostOrderServiceHarness = {
  service: UniswapXOrderService
  orderValidator: FakeOffChainValidator
  onChainValidator: FakeOnChainValidator
  repository: FakeOrdersRepository
  analytics: RecordingAnalytics
  logger: Logger
  cosigner: FakeCosigner
  tracking: RecordingStartTracking
}

export type PostOrderHandlerHarness = PostOrderServiceHarness & { handler: PostOrderHandler }

/**
 * The order service as the post path uses it, every dependency a fake. The test file must
 * jest.mock lib/handlers/shared/sfn (see RecordingStartTracking).
 */
export function makePostOrderService(overrides: PostOrderServiceOverrides = {}): PostOrderServiceHarness {
  const orderValidator = overrides.orderValidator ?? new FakeOffChainValidator()
  const onChainValidator = overrides.onChainValidator ?? new FakeOnChainValidator()
  const repository = overrides.repository ?? new FakeOrdersRepository()
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
    overrides.providerMap ?? MOCK_PROVIDER_MAP
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
export function makePostOrderHandler(
  route: PostOrderRoute,
  overrides: PostOrderServiceOverrides = {}
): PostOrderHandlerHarness {
  const isLimitRoute = route === LIMIT_ORDER_ROUTE
  const harness = makePostOrderService({
    getMaxOpenOrders: isLimitRoute ? getMaxLimitOpenOrders : getMaxOpenOrders,
    ...overrides,
  })
  const handler = new PostOrderHandler(
    isLimitRoute ? 'post-limit-order' : 'post-order',
    new FixedRequestInjector().build(),
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
