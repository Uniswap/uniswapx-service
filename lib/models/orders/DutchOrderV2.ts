import { CosignedV2DutchOrder as SDKCosignedDutchOrderV2, OrderType } from '@uniswap/uniswapx-sdk'

export class DutchOrderV2 {
  constructor(readonly inner: SDKCosignedDutchOrderV2) {}
  get orderType() {
    return OrderType.Dutch_V2
  }
}
