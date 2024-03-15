import { OrderType } from '@uniswap/uniswapx-sdk'

export class UnexpectedOrderTypeError extends Error {
  constructor(orderType: OrderType) {
    super(`Unexpected orderType: ${orderType}`)
  }
}
