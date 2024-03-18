import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../entities'
import { ChainId } from '../util/chain'
import { IOrder } from './IOrder'

export class LimitOrder implements IOrder {
  private constructor(
    readonly chainId: ChainId,
    readonly signature: string,
    readonly inner: SDKDutchOrder,
    readonly orderStatus: ORDER_STATUS,
    readonly quoteId?: string
  ) {}

  get orderType(): OrderType {
    return OrderType.Limit
  }

  static fromSDK(
    chainId: ChainId,
    signature: string,
    inner: SDKDutchOrder,
    orderStatus: ORDER_STATUS,
    quoteId?: string
  ) {
    return new LimitOrder(chainId, signature, inner, orderStatus, quoteId)
  }
}
