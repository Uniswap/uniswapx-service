import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class DutchV1Order implements IOrder {
  private constructor(
    readonly chainId: number,
    readonly signature: string,
    readonly inner: SDKDutchOrder,
    readonly quoteId?: string
  ) {
    return
  }

  get orderType(): OrderType {
    return OrderType.Dutch
  }

  static fromSDK(chainId: number, signature: string, inner: SDKDutchOrder, quoteId?: string): DutchV1Order {
    return new DutchV1Order(chainId, signature, inner, quoteId)
  }
}
