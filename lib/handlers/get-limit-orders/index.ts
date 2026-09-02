import { OrderValidator, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { RelayOrderService } from '../../services/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'

import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { DynamoQuoteMetadataRepository } from '../../repositories/quote-metadata-repository'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { GetOrdersHandler, GET_LIMIT_ORDERS_HANDLER_OPTIONS } from '../get-orders/handler'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'
import { createReadPathDocumentClient } from '../shared/dynamo'
import { GetLimitOrdersInjector } from './injector'
import { getLimitOrdersQueryCache } from './query-cache'

// This Lambda only reads, so its repositories share the sub-second query cache. Write
// paths build them without it -- see query-cache.ts. Its DocumentClient fails fast on
// throttles -- see shared/dynamo.ts.
const repo = LimitOrdersRepository.create(createReadPathDocumentClient(), getLimitOrdersQueryCache)
const quoteMetadataRepository = DynamoQuoteMetadataRepository.create(createReadPathDocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)
const onChainValidatorMap = new OnChainValidatorMap<OrderValidator>()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  repo, //same as normal repo for limit orders
  quoteMetadataRepository,
  log,
  getMaxOpenOrders,
  AnalyticsService.create(),
  new Map()
)

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<RelayOrderValidator>()

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(createReadPathDocumentClient(), getLimitOrdersQueryCache),
  log,
  getMaxOpenOrders,
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, AnalyticsService.create())
)

const getLimitOrdersInjectorPromise = new GetLimitOrdersInjector('getLimitOrdersInjector').build()
const getLimitOrdersHandler = new GetOrdersHandler(
  'getLimitOrdersHandler',
  getLimitOrdersInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log),
  GET_LIMIT_ORDERS_HANDLER_OPTIONS
)

module.exports = {
  getLimitOrdersHandler: getLimitOrdersHandler.handler,
}
