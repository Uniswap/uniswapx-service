import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class LimitOrder implements IOrder {
  constructor(
    readonly inner: SDKDutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string
  ) {}

  get orderType(): OrderType {
    return OrderType.Limit
  }
}
