import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../util/chain'

export class RelayOrder {
  constructor(readonly inner: SDKRelayOrder, readonly chainId: ChainId, readonly signature: string) {}

  get orderType() {
    return OrderType.Relay
  }
}
