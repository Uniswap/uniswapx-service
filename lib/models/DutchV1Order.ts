import { DutchOrder as SDKDutchOrder, OrderType, UniswapXOrderParser } from '@uniswap/uniswapx-sdk'
import { Order } from './Order'

export class DutchV1Order extends Order {
  private uniswapXOrderParse = new UniswapXOrderParser()
  constructor(
    readonly inner: SDKDutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch
  }
}
