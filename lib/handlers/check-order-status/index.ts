import { OrderType, RelayOrderValidator as OnChainRelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { RelayOrderService } from '../../services/RelayOrderService'
import { ChainId, SUPPORTED_CHAINS } from '../../util/chain'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import { calculateDutchRetryWaitSeconds, FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../check-order-status/util'
import { EventWatcherMap } from '../EventWatcherMap'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { LazyProviderMap } from '../shared'
import { getMaxOpenOrders } from '../post-order/injector'
import { CheckOrderStatusHandler } from './handler'
import { CheckOrderStatusInjector } from './injector'
import { CheckOrderStatusService, CheckOrderStatusUtils } from './service'

const supportedChainSet = new Set<ChainId>(SUPPORTED_CHAINS)
const providerMap = new LazyProviderMap()

const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000)
const relayOrderValidatorMap = new OnChainValidatorMap<OnChainRelayOrderValidator>([], {
  factory: (chainId) => new OnChainRelayOrderValidator(providerMap.get(chainId)!, chainId),
  isSupported: (chainId) => supportedChainSet.has(chainId),
})

const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  EventWatcherMap.createRelayEventWatcherMap(),
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders,
  new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, AnalyticsService.create())
)

const documentClient = new DocumentClient()
const dutchOrdersRepository = DutchOrdersRepository.create(documentClient)
const limitOrdersRepository = LimitOrdersRepository.create(documentClient)

const checkOrderStatusInjectorPromise = new CheckOrderStatusInjector('checkOrderStatusInjector').build()
const checkOrderStatusHandler = new CheckOrderStatusHandler(
  'checkOrderStatusHandler',
  checkOrderStatusInjectorPromise,
  new CheckOrderStatusService(
    dutchOrdersRepository,
    FILL_EVENT_LOOKBACK_BLOCKS_ON,
    new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, AnalyticsService.create()),
    new CheckOrderStatusUtils(
      OrderType.Dutch,
      AnalyticsService.create(),
      dutchOrdersRepository,
      calculateDutchRetryWaitSeconds
    )
  ),

  new CheckOrderStatusService(
    LimitOrdersRepository.create(documentClient),
    FILL_EVENT_LOOKBACK_BLOCKS_ON,
    new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, AnalyticsService.create()),
    new CheckOrderStatusUtils(
      OrderType.Limit,
      AnalyticsService.create(),
      limitOrdersRepository,
      calculateDutchRetryWaitSeconds
    )
  ),
  relayOrderService
)

module.exports = {
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
}
