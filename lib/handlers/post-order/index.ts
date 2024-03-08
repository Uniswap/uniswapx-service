import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { SUPPORTED_CHAINS } from '../../util/chain'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { PostOrderHandler } from './handler'
import { PostOrderInjector } from './injector'

const onChainValidatorMap = new OnChainValidatorMap()

for (const chainId of SUPPORTED_CHAINS) {
  onChainValidatorMap.set(
    chainId,
    new OrderValidator(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), chainId)
  )
}

const postOrderInjectorPromise = new PostOrderInjector('postOrderInjector').build()
const postOrderHandler = new PostOrderHandler('postOrdersHandler', postOrderInjectorPromise, onChainValidatorMap)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}
