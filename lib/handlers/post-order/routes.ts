import { OrderType } from '@uniswap/uniswapx-sdk'

// The route an order is posted to decides the table it is stored in, but order tracking
// picks the table from the order's type. An order on the other route is stored where its
// tracker never looks, so each route accepts only the order types it stores.
export type PostOrderRoute = {
  path: string
  publicPath: string
  accepts: (orderType: OrderType) => boolean
}

export const DUTCH_AUCTION_ORDER_ROUTE: PostOrderRoute = {
  path: '/dutch-auction/order',
  publicPath: '/v2/order',
  accepts: (orderType) => orderType !== OrderType.Limit,
}

export const LIMIT_ORDER_ROUTE: PostOrderRoute = {
  path: '/limit/order',
  publicPath: '/v2/limit-order',
  accepts: (orderType) => orderType === OrderType.Limit,
}

export function wrongRouteDetail(orderType: OrderType): string {
  const route = LIMIT_ORDER_ROUTE.accepts(orderType) ? LIMIT_ORDER_ROUTE : DUTCH_AUCTION_ORDER_ROUTE
  // Callers that hit this are on the public API, which rewrites paths, so name the public one.
  return `${orderType} orders must be posted to ${route.publicPath}`
}
