import { OrderValidator, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { RelayOrderService } from '../../services/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'

import { log } from '../../Logging'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { GetOrdersHandler } from '../get-orders/handler'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'
import { GetLimitOrdersInjector } from './injector'

const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)
const onChainValidatorMap = new OnChainValidatorMap<OrderValidator>()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  log,
  getMaxOpenOrders,
  AnalyticsService.create()
)

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<RelayOrderValidator>()

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders
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
