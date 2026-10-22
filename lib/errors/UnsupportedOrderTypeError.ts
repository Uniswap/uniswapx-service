import { OrderType } from '@uniswap/uniswapx-sdk'

export class UnsupportedOrderTypeError extends Error {
  constructor(orderType: OrderType) {
    super(`Unsupported orderType: ${orderType}`)
  }
}
