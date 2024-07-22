import { OrderType } from '@uniswap/uniswapx-sdk'

export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  INSUFFICIENT_FUNDS = 'insufficient-funds',
}

export type OrderInput = {
  token: string
  startAmount?: string
  endAmount?: string
}

export type PriorityOrderInput = {
  token: string
  amount: string
  mpsPerPriorityFeeWei: string
}

export type OrderOutput = {
  token: string
  startAmount: string
  endAmount: string
  recipient: string
}

export type PriorityOrderOutput = {
  token: string
  amount: string
  mpsPerPriorityFeeWei: string
  recipient: string
}

export type SettledAmount = {
  tokenOut: string
  amountOut: string
  tokenIn: string
  amountIn: string
}

export type SharedXOrderEntity = {
  encodedOrder: string
  signature: string
  nonce: string
  orderHash: string
  orderStatus: ORDER_STATUS
  chainId: number
  offerer: string
  reactor: string
  deadline: number
  createdAt?: number
  // Filler field is defined when the order has been filled and the status tracking function has recorded the filler address.
  filler?: string
  // QuoteId field is defined when the order has a quote associated with it.
  quoteId?: string
  requestId?: string
  // TxHash field is defined when the order has been filled and there is a txHash associated with the fill.
  txHash?: string
  // SettledAmount field is defined when the order has been filled and the fill amounts have been recorded.
  settledAmounts?: SettledAmount[]
}

export type DutchV1OrderEntity = SharedXOrderEntity & {
  type: OrderType.Dutch | OrderType.Limit
  decayStartTime?: number
  decayEndTime?: number
  input: OrderInput
  outputs: OrderOutput[]
}

export type DutchV2OrderEntity = SharedXOrderEntity & {
  type: OrderType.Dutch_V2
  decayStartTime: number
  decayEndTime: number
  input: OrderInput
  outputs: OrderOutput[]
  cosignerData: {
    decayStartTime: number
    decayEndTime: number
    exclusiveFiller: string
    inputOverride: string
    outputOverrides: string[]
  }
  cosignature: string
}

export type PriorityOrderEntity = SharedXOrderEntity & {
  type: OrderType.Priority
  auctionStartBlock: number
  baselinePriorityFeeWei: string
  input: PriorityOrderInput
  outputs: PriorityOrderOutput[]
  cosignerData: {
    auctionTargetBlock: number
  }
  cosignature: string
}

// Db representation of Dutch V1, Dutch V2, or Limit Order
// indexes are returned at runtime but not represented on this type. Ideally we will include a mapping at repo layer boundary
export type UniswapXOrderEntity = DutchV1OrderEntity | DutchV2OrderEntity | PriorityOrderEntity

export enum SORT_FIELDS {
  CREATED_AT = 'createdAt',
}

export function isPriorityOrderEntity(order: UniswapXOrderEntity): order is PriorityOrderEntity {
  return 'cosignerData' in order && 'auctionTargetBlock' in order.cosignerData
}

export function isDutchV2OrderEntity(order: UniswapXOrderEntity): order is DutchV2OrderEntity {
  return 'cosignerData' in order && 'exclusiveFiller' in order.cosignerData
}

export function isDutchV1OrderEntity(order: UniswapXOrderEntity): order is DutchV1OrderEntity {
  return !('cosignerData' in order)
}
