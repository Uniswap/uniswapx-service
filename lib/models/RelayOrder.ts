import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class RelayOrder implements IOrder {
  private constructor(readonly chainId: number, readonly signature: string, readonly inner: SDKRelayOrder) {}

  get orderType(): OrderType {
    return OrderType.Relay
  }

  static fromSDK(chainId: number, signature: string, inner: SDKRelayOrder) {
    return new RelayOrder(chainId, signature, inner)
  }
}
