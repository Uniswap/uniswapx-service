import { OrderType } from '@uniswap/uniswapx-sdk'

export interface IOrder {
  get orderType(): OrderType
}
