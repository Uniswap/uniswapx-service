import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { Order } from './Order'

export class DutchV2Order extends Order {
  constructor(readonly inner: SDKV2DutchOrder, readonly signature: string, readonly chainId: number) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }
}
