import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class DutchV2Order implements IOrder {
  private constructor(readonly chainId: number, readonly signature: string, readonly inner: SDKV2DutchOrder) {}

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }

  static fromSDK(chainId: number, signature: string, inner: SDKV2DutchOrder) {
    return new DutchV2Order(chainId, signature, inner)
  }
}
