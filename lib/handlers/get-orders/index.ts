import { GetOrdersHandler } from './handler'
import { GetOrdersInjector } from './injector'

import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { SINGLE_PAGE, UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'

import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { DynamoQuoteMetadataRepository } from '../../repositories/quote-metadata-repository'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'
import { createReadPathDocumentClient } from '../shared/dynamo'
import { getOrdersQueryCache } from './query-cache'

// This Lambda only reads, so its repositories share the sub-second query cache. Write
// paths build them without it -- see query-cache.ts. Its DocumentClient fails fast on
// throttles -- see shared/dynamo.ts.
const repo = DutchOrdersRepository.create(createReadPathDocumentClient(), getOrdersQueryCache)
const limitRepo = LimitOrdersRepository.create(createReadPathDocumentClient(), getOrdersQueryCache)
const quoteMetadataRepository = DynamoQuoteMetadataRepository.create(createReadPathDocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)
const onChainValidatorMap = new OnChainValidatorMap<OrderValidator>()
const providerMap = new Map()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  limitRepo,
  quoteMetadataRepository,
  log,
  getMaxOpenOrders,
  AnalyticsService.create(),
  providerMap,
  undefined,
  SINGLE_PAGE
)

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler(
  'getOrdersHandler',
  getOrdersInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, log)
)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
}
