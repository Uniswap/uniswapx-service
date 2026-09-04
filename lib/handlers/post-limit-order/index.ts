import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_YEAR_IN_SECONDS } from '../../util/constants'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from '../post-order/handler'
import { PostOrderBodyParser } from '../post-order/PostOrderBodyParser'
import { LazyProviderMap } from '../shared'
import { getMaxLimitOpenOrders, PostLimitOrderInjector } from './injector'
import { DynamoQuoteMetadataRepository } from '../../repositories/quote-metadata-repository'

const providerMap = new LazyProviderMap()

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>(
  [],
  (chainId) => new OnChainOrderValidator(providerMap.get(chainId), chainId)
)

const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_YEAR_IN_SECONDS, {
  SkipDecayStartTimeValidation: true,
})
const repo = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
const quoteMetadataRepository = DynamoQuoteMetadataRepository.create(new DynamoDB.DocumentClient())

const postLimitOrderInjectorPromise = new PostLimitOrderInjector('postLimitOrderInjector').build()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  repo, // same repo for limit orders
  quoteMetadataRepository,
  log,
  getMaxLimitOpenOrders,
  AnalyticsService.create(),
  providerMap
)

const postLimitOrderHandler = new PostOrderHandler(
  'postLimitOrdersHandler',
  postLimitOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postLimitOrderHandler: postLimitOrderHandler.handler,
}
