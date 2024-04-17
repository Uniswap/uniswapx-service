import { OrderType, RelayOrderValidator as OnChainRelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { RelayOrderService } from '../../services/RelayOrderService/RelayOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { getMaxOpenOrders } from '../post-order/injector'
import { CheckOrderStatusHandler } from './handler'
import { CheckOrderStatusInjector } from './injector'
import { CheckOrderStatusService } from './service'

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<OnChainRelayOrderValidator>()
for (const chainId of SUPPORTED_CHAINS) {
  relayOrderValidatorMap.set(
    chainId,
    new OnChainRelayOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders,
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON)
)

const mockLookbackFn = () => 10

const checkOrderStatusInjectorPromise = new CheckOrderStatusInjector('checkOrderStatusInjector').build()
const checkOrderStatusHandler = new CheckOrderStatusHandler(
  'checkOrderStatusHandler',
  checkOrderStatusInjectorPromise,
  new CheckOrderStatusService(
    DutchOrdersRepository.create(new DocumentClient()),
    OrderType.Dutch,
    AnalyticsService.create(),
    mockLookbackFn
  ),

  new CheckOrderStatusService(
    LimitOrdersRepository.create(new DocumentClient()),
    OrderType.Limit,
    AnalyticsService.create(),
    FILL_EVENT_LOOKBACK_BLOCKS_ON,
    () => {
      return 30
    }
  ),
  relayOrderService
)

module.exports = {
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
}
