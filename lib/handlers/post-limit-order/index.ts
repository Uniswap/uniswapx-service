import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from '../post-order/handler'
import { PostLimitOrderInjector } from './injector'

const onChainValidatorMap = new OnChainValidatorMap()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const postLimitOrderInjectorPromise = new PostLimitOrderInjector('postLimitOrderInjector').build()
const postLimitOrderHandler = new PostOrderHandler(
  'postLimitOrdersHandler',
  postLimitOrderInjectorPromise,
  onChainValidatorMap
)

module.exports = {
  postLimitOrderHandler: postLimitOrderHandler.handler,
}
