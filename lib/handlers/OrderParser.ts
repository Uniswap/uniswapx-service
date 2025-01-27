import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder, UniswapXOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../util/chain'
import { UniswapXOrderEntity } from '../entities'

export function parseOrder(order: UniswapXOrderEntity, chainId: ChainId): UniswapXOrder {
  switch (order.type) {
    case OrderType.Dutch:
    case OrderType.Limit:
      return DutchOrder.parse(order.encodedOrder, chainId)
    case OrderType.Dutch_V2:
      return CosignedV2DutchOrder.parse(order.encodedOrder, chainId)
    case OrderType.Dutch_V3:
      return CosignedV3DutchOrder.parse(order.encodedOrder, chainId)
    case OrderType.Priority:
      return CosignedPriorityOrder.parse(order.encodedOrder, chainId)
    default:
      throw new Error(`Unsupported OrderType ${JSON.stringify(order)}, No Parser Configured`)
  }
}
