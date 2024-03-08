import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'

export class LimitOrder {
  constructor(readonly inner: SDKDutchOrder) {}
  get orderType() {
    return OrderType.Limit
  }
}
