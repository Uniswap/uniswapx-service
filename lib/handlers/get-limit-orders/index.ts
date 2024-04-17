import { OrderValidator, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { RelayOrderService } from '../../services/RelayOrderService/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'

import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { GetOrdersHandler } from '../get-orders/handler'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'
import { GetLimitOrdersInjector } from './injector'

const repo = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)
const onChainValidatorMap = new OnChainValidatorMap<OrderValidator>()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  repo, //same as normal repo for limit orders
  log,
  getMaxOpenOrders,
  AnalyticsService.create()
)

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<RelayOrderValidator>()

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders,
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON)
)

const getLimitOrdersInjectorPromise = new GetLimitOrdersInjector('getLimitOrdersInjector').build()
const getLimitOrdersHandler = new GetOrdersHandler(
  'getLimitOrdersHandler',
  getLimitOrdersInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log)
)

module.exports = {
  getLimitOrdersHandler: getLimitOrdersHandler.handler,
}
