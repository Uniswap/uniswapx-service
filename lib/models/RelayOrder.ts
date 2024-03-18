import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../entities'
import { ChainId } from '../util/chain'
import { IOrder } from './IOrder'

export class RelayOrder implements IOrder {
  private constructor(
    readonly chainId: ChainId,
    readonly signature: string,
    readonly inner: SDKRelayOrder,
    readonly orderStatus: ORDER_STATUS
  ) {}

  get orderType(): OrderType {
    return OrderType.Relay
  }

  static fromSDK(chainId: ChainId, signature: string, inner: SDKRelayOrder, orderStatus: ORDER_STATUS) {
    return new RelayOrder(chainId, signature, inner, orderStatus)
  }
}
