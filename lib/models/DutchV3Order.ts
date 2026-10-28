import { CosignedV3DutchOrder as SDKV3DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { Order } from './Order'

export class DutchV3Order extends Order {
  constructor(
    readonly inner: SDKV3DutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string,
    readonly requestId?: string
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch_V3
  }
}
