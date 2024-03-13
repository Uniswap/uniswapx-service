import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { Order } from './Order'

export class RelayOrder extends Order {
  constructor(readonly inner: SDKRelayOrder, readonly signature: string, readonly chainId: number) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch
  }
}
