import { OrderType } from '@uniswap/uniswapx-sdk'
import { DUTCH_LIMIT } from '../util/order'

export class UnsupportedOrderTypeError extends Error {
  constructor(orderType: OrderType | typeof DUTCH_LIMIT) {
    super(`Unsupported orderType: ${orderType}`)
  }
}
