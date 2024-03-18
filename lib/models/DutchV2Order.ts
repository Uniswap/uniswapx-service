import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class DutchV2Order implements IOrder {
  constructor(readonly inner: SDKV2DutchOrder, readonly signature: string, readonly chainId: number) {}

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }
}
