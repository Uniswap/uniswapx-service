import { OrderType, OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan } from 'bunyan'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { ONE_DAY_IN_SECONDS } from '../../util/constants'
import { OrderValidator } from '../../util/order-validator'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from './handler'
import { getMaxOpenOrders, PostOrderInjector } from './injector'

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
  // Code duplicated from APIGLambdaHandler.buildHandler() with the requestId omitted.
  //
  // This logger will be overwritten with the logger that the APIGLambdaHandler creates, so for now,
  // this is just a placeholder.
  //
  // This should be revisited and improved in the future by extracting the logger creation from the request path
  // and relying on this injected logger as the source of truth..
  bunyan.createLogger({
    name: 'postOrdersHandler',
    serializers: bunyan.stdSerializers,
    level: process.env.NODE_ENV == 'test' ? bunyan.FATAL + 1 : bunyan.INFO,
  }),
  getMaxOpenOrders,
  OrderType.Dutch
)
const postOrderHandler = new PostOrderHandler('postOrdersHandler', postOrderInjectorPromise, uniswapXOrderService)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
