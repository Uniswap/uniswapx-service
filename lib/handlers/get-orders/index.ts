import { GetOrdersHandler } from './handler'
import { GetOrdersInjector } from './injector'

import { OrderValidator, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { RelayOrderService } from '../../services/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'

import { log } from '../../Logging'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/order-validator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'

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

const getOrdersInjectorPromise = new GetOrdersInjector('getOrdersInjector').build()
const getOrdersHandler = new GetOrdersHandler(
  'getOrdersHandler',
  getOrdersInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log)
)

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
}
