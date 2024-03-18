import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { IOrder } from './IOrder'

export class RelayOrder implements IOrder {
  constructor(readonly inner: SDKRelayOrder, readonly signature: string, readonly chainId: number) {}

  get orderType(): OrderType {
    return OrderType.Relay
  }
}
