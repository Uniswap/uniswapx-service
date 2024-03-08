import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'

export class DutchOrderV1 {
  constructor(readonly inner: SDKDutchOrder) {}
  get orderType() {
    return OrderType.Dutch
  }
}
