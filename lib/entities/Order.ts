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

export type OrderOutput = {
  token: string
  startAmount: string
  endAmount: string
  recipient: string
}

export type SettledAmount = {
  tokenOut: string
  amountOut: string
  tokenIn: string
  amountIn: string
}

// Db representation of Dutch V1, Dutch V2, or Limit Order
// indexes are returned at runtime but not represented on this type. Ideally we will include a mapping at repo layer boundary
export type UniswapXOrderEntity = {
  type: OrderType.Dutch | OrderType.Dutch_V2 | OrderType.Limit
  encodedOrder: string
  signature: string
  nonce: string
  orderHash: string
  orderStatus: ORDER_STATUS
  chainId: number
  offerer: string
  reactor: string
  decayStartTime: number
  decayEndTime: number
  deadline: number
  input: OrderInput
  outputs: OrderOutput[]
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
  cosignerData?: {
    decayStartTime: number
    decayEndTime: number
    exclusiveFiller: string
    inputOverride: string
    outputOverrides: string[]
  }
  cosignature?: string
}

export enum SORT_FIELDS {
  CREATED_AT = 'createdAt',
}
