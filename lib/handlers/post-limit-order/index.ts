import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_YEAR_IN_SECONDS } from '../../util/constants'
import { OrderValidator } from '../../util/order-validator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from '../post-order/handler'
import { PostOrderBodyParser } from '../post-order/PostOrderBodyParser'
import { getMaxLimitOpenOrders, PostLimitOrderInjector } from './injector'

const onChainValidatorMap = new OnChainValidatorMap()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const orderValidator = new OrderValidator(() => new Date().getTime() / 1000, ONE_YEAR_IN_SECONDS, {
  SkipDecayStartTimeValidation: true,
})
const repo = LimitOrdersRepository.create(new DynamoDB.DocumentClient())

const postLimitOrderInjectorPromise = new PostLimitOrderInjector('postLimitOrderInjector').build()

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  log,
  getMaxLimitOpenOrders,
  AnalyticsService.create()
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
