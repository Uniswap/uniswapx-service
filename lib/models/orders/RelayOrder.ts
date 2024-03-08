import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'

export class RelayOrder {
  constructor(readonly inner: SDKRelayOrder) {}

  get orderType() {
    return OrderType.Relay
  }
}
