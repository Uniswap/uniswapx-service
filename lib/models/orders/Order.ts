import { OrderType } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../util/chain'

export abstract class Order {
  abstract get chainId(): ChainId
  abstract get orderType(): OrderType
}
