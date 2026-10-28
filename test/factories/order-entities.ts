import { DutchOrder } from '@uniswap/uniswapx-sdk'
import { toOrderEntity } from '../../lib/core/orders/storedRow'
import { UniswapXOrderEntity } from '../../lib/entities'
import { LimitOrder } from '../../lib/models/LimitOrder'

// A V1-encoded order (today only limit orders) as the post path builds its entity.
export function dutchOrderEntity(order: DutchOrder, signature = '', quoteId?: string): UniswapXOrderEntity {
  return toOrderEntity(new LimitOrder(order, signature, order.chainId, quoteId))
}
