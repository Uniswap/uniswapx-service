

let parsedOrder: UniswapXOrder
switch (orderType) {
  case OrderType.Dutch:
  case OrderType.Limit:
    parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
    break
  case OrderType.Dutch_V2:
    parsedOrder = CosignedV2DutchOrder.parse(order.encodedOrder, chainId)
    break
  case OrderType.Dutch_V3:
    parsedOrder = CosignedV3DutchOrder.parse(order.encodedOrder, chainId)
    break
  case OrderType.Priority:
    parsedOrder = CosignedPriorityOrder.parse(order.encodedOrder, chainId)
    break
  default:
    throw new Error(`Unsupported OrderType ${orderType}, No Parser Configured`)
}