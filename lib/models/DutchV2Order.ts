import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../entities'
import { ChainId } from '../util/chain'
import { IOrder } from './IOrder'

export class DutchV2Order implements IOrder {
  private constructor(
    readonly chainId: ChainId,
    readonly signature: string,
    readonly inner: SDKV2DutchOrder,
    readonly orderStatus: ORDER_STATUS
  ) {}

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }

  static fromSDK(chainId: ChainId, signature: string, inner: SDKV2DutchOrder, orderStatus: ORDER_STATUS) {
    return new DutchV2Order(chainId, signature, inner, orderStatus)
  }
}
