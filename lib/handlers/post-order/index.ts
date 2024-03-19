import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { OrderValidator } from '../../util/order-validator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'
import { PostOrderBodyParser } from './PostOrderBodyParser'

const onChainValidatorMap = new OnChainValidatorMap()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()

const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
const orderValidator = new OrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)

const uniswapXOrderService = new UniswapXOrderService(
  orderValidator,
  onChainValidatorMap,
  repo,
  log,
  getMaxOpenOrders,
  AnalyticsService.create()
)
const postOrderHandler = new PostOrderHandler(
  'postOrdersHandler',
  postOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
