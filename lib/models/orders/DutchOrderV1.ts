import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../util/chain'

export class DutchOrderV1 {
  constructor(
    readonly inner: SDKDutchOrder,
    readonly chainId: ChainId,
    readonly signature: string,
    readonly quoteId?: string
  ) {}
  get orderType() {
    return OrderType.Dutch
  }
}
