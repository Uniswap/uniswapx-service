import {
  OrderValidator as OnChainOrderValidator,
  RelayOrderValidator as OnChainRelayOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { RelayOrderService } from '../../services/RelayOrderService/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_YEAR_IN_SECONDS } from '../../util/constants'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from '../post-order/handler'
import { PostOrderBodyParser } from '../post-order/PostOrderBodyParser'
import { getMaxLimitOpenOrders, PostLimitOrderInjector } from './injector'

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const orderValidator = new OffChainUniswapXOrderValidator(() => new Date().getTime() / 1000, ONE_YEAR_IN_SECONDS, {
  SkipDecayStartTimeValidation: true,
})
const repo = LimitOrdersRepository.create(new DynamoDB.DocumentClient())

const postLimitOrderInjectorPromise = new PostLimitOrderInjector('postLimitOrderInjector').build()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  repo, // same repo for limit orders as
  log,
  getMaxLimitOpenOrders,
  AnalyticsService.create()
)

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<OnChainRelayOrderValidator>()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}
const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  () => 0, // set max open orders to 0 for relay orders posted to limit route, essentially disable this
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON)
)

const postLimitOrderHandler = new PostOrderHandler(
  'postLimitOrdersHandler',
  postLimitOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postLimitOrderHandler: postLimitOrderHandler.handler,
}
