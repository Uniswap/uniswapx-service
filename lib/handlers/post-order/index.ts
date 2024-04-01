import {
  OrderValidator as OnChainOrderValidator,
  RelayOrderValidator as OnChainRelayOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { log } from '../../Logging'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { RelayOrderService } from '../../services/RelayOrderService'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { OrderValidator } from '../../util/order-validator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'
import { PostOrderBodyParser } from './PostOrderBodyParser'

const onChainValidatorMap = new OnChainValidatorMap<OnChainOrderValidator>()

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

// const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
const relayOrderValidator = new OffChainRelayOrderValidator(() => new Date().getTime() / 1000, ONE_DAY_IN_SECONDS)
const relayOrderValidatorMap = new OnChainValidatorMap<OnChainRelayOrderValidator>()
for (const chainId of SUPPORTED_CHAINS) {
  relayOrderValidatorMap.set(
    chainId,
    new OnChainRelayOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OnChainOrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}
const relayOrderService = new RelayOrderService(
  relayOrderValidator,
  relayOrderValidatorMap,
  RelayOrderRepository.create(new DynamoDB.DocumentClient()),
  log,
  getMaxOpenOrders
)

const postOrderHandler = new PostOrderHandler(
  'postOrdersHandler',
  postOrderInjectorPromise,
  new OrderDispatcher(uniswapXOrderService, relayOrderService, log),
  new PostOrderBodyParser(log)
)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
