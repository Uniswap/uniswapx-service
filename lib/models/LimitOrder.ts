import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { Order } from './Order'

export class LimitOrder extends Order {
  constructor(
    readonly inner: SDKDutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Limit
  }
}
