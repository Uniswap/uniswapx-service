import {
  OrderValidator as OnChainOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { STAGE } from '../../util/stage'
import { checkDefined } from '../../preconditions/preconditions'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { cosignersFromEnv } from '../../util/cosigners'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { LazyProviderMap } from '../shared/'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'
import { PostOrderBodyParser } from './PostOrderBodyParser'
import { DUTCH_AUCTION_ORDER_ROUTE } from './routes'

const providerMap = new LazyProviderMap()

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>(
  [],
  (chainId) => new OnChainOrderValidator(providerMap.get(chainId), chainId)
)

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()

const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator({
  getCurrentTime: () => new Date().getTime() / 1000,
  deadlineValidityPeriodSeconds: ONE_DAY_IN_SECONDS,
  ...cosignersFromEnv(),
})

// Set up webhook provider for immediate notifications
const stage = checkDefined(process.env['stage'], 'stage should be defined in the .env')
const s3Key = stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY
const webhookProvider = new S3WebhookConfigurationProvider(`${WEBHOOK_CONFIG_BUCKET}-${stage}-1`, s3Key)

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  repo, // unused on the post path; getLimitOrders is GET-only
  log,
  getMaxOpenOrders,
  AnalyticsService.create(),
  providerMap,
  webhookProvider
)

const postOrderHandler = new PostOrderHandler(
  'postOrdersHandler',
  postOrderInjectorPromise,
  uniswapXOrderService,
  new PostOrderBodyParser(log),
  DUTCH_AUCTION_ORDER_ROUTE
)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
