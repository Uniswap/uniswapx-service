import {
  OrderValidator as OnChainOrderValidator,
  RelayOrderValidator as OnChainRelayOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { DynamoQuoteMetadataRepository } from '../../repositories/quote-metadata-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { RelayOrderService } from '../../services/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { STAGE } from '../../util/stage'
import { checkDefined } from '../../preconditions/preconditions'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_DAY_IN_SECONDS, RPC_HEADERS } from '../../util/constants'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { ProviderMap } from '../shared/'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'
import { PostOrderBodyParser } from './PostOrderBodyParser'

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(
      new ethers.providers.StaticJsonRpcProvider({
        url: CONFIG.rpcUrls.get(chainId),
        headers: RPC_HEADERS,
      }),
      chainId
    )
  )
}

const providerMap: ProviderMap = new Map()

for (const chainId of SUPPORTED_CHAINS) {
  providerMap.set(
    chainId,
    new ethers.providers.StaticJsonRpcProvider({
      url: CONFIG.rpcUrls.get(chainId),
      headers: RPC_HEADERS,
    })
  )
}

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

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<OnChainRelayOrderValidator>()
for (const chainId of SUPPORTED_CHAINS) {
  relayOrderValidatorMap.set(
    chainId,
    new OnChainRelayOrderValidator(
      new ethers.providers.StaticJsonRpcProvider({
        url: CONFIG.rpcUrls.get(chainId),
        headers: RPC_HEADERS,
      }),
      chainId
    )
  )
}

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders,
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, AnalyticsService.create())
)

const postOrderHandler = new PostOrderHandler(
  'postOrdersHandler',
  postOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
