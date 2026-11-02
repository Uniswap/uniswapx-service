import { OrderType } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { S3ChainOwners } from '../../chain-owners/owners'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { FillEventLogger } from '../check-order-status/fill-event-logger'
import {
  calculateDutchRetryWaitSeconds,
  calculateLimitRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  LIMIT_FILL_EVENT_LOOKBACK_BLOCKS,
} from '../check-order-status/util'
import { CheckOrderStatusHandler } from './handler'
import { CheckOrderStatusInjector } from './injector'
import { CheckOrderStatusService, CheckOrderStatusUtils } from './service'

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
    LIMIT_FILL_EVENT_LOOKBACK_BLOCKS,
    new FillEventLogger(LIMIT_FILL_EVENT_LOOKBACK_BLOCKS, AnalyticsService.create()),
    new CheckOrderStatusUtils(
      OrderType.Limit,
      AnalyticsService.create(),
      limitOrdersRepository,
      calculateLimitRetryWaitSeconds
    )
  ),
  S3ChainOwners.fromEnv()
)

module.exports = {
  checkOrderStatusHandler: checkOrderStatusHandler.handler,
}
