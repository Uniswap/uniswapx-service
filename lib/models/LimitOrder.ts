import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class LimitOrder implements IOrder {
  private constructor(
    readonly chainId: number,
    readonly signature: string,
    readonly inner: SDKDutchOrder,
    readonly quoteId?: string
  ) {}

  get orderType(): OrderType {
    return OrderType.Limit
  }

  static fromSDK(chainId: number, signature: string, inner: SDKDutchOrder, quoteId?: string) {
    return new LimitOrder(chainId, signature, inner, quoteId)
  }
}
