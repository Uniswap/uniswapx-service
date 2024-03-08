import { OrderType } from '@uniswap/uniswapx-sdk'

export abstract class Order {
  abstract get orderType(): OrderType
}
