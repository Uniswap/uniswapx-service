import {
  OrderValidator as OnChainOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { DynamoQuoteMetadataRepository } from '../../repositories/quote-metadata-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { STAGE } from '../../util/stage'
import { checkDefined } from '../../preconditions/preconditions'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { LazyProviderMap } from '../shared/'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'
import { PostOrderBodyParser } from './PostOrderBodyParser'

const providerMap = new LazyProviderMap()

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>(
  [],
  (chainId) => new OnChainOrderValidator(providerMap.get(chainId), chainId)
)

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()

const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
const limitRepo = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
const quoteMetadataRepo = DynamoQuoteMetadataRepository.create(new DynamoDB.DocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)

// Set up webhook provider for immediate notifications
const stage = checkDefined(process.env['stage'], 'stage should be defined in the .env')
const s3Key = stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY
const webhookProvider = new S3WebhookConfigurationProvider(`${WEBHOOK_CONFIG_BUCKET}-${stage}-1`, s3Key)

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  limitRepo,
  quoteMetadataRepo,
  log,
  getMaxOpenOrders,
  AnalyticsService.create(),
  providerMap,
  webhookProvider
)

const postOrderHandler = new PostOrderHandler(
  'postOrdersHandler',
  postOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
