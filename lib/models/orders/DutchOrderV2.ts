import { CosignedV2DutchOrder as SDKCosignedDutchOrderV2, OrderType } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../util/chain'

export class DutchOrderV2 {
  constructor(
    readonly inner: SDKCosignedDutchOrderV2,
    readonly chainId: ChainId,
    readonly signature: string,
    readonly quoteId?: string
  ) {}
  get orderType() {
    return OrderType.Dutch_V2
  }
}
