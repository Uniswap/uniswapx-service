import { OrderType } from '@uniswap/gouda-sdk'

export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
  INSUFFICIENT_FUNDS = 'insufficient-funds',
}

export type OrderInput = {
  token: string
  startAmount?: string
  endAmount?: string
}

export type OrderOutput = {
  token: string
  startAmount?: string
  endAmount?: string
  recipient?: string
}

export type SettledAmount = {
  tokenOut?: string
  amountOut?: string
  tokenIn?: string
  amountIn?: string
}

export type OrderEntity = {
  type: OrderType
  encodedOrder: string
  signature: string
  nonce: string
  orderHash: string
  orderStatus: ORDER_STATUS
  chainId: number
  offerer: string
  reactor: string
  startTime: number
  endTime: number
  deadline: number
  input: OrderInput
  outputs: OrderOutput[]
  // Filler field is defined when the order has been filled and the status tracking function has recorded the filler address.
  filler?: string
  // QuoteId field is defined when the order has a quote associated with it.
  quoteId?: string
  // TxHash field is defined when the order has been filled and there is a txHash associated with the fill.
  txHash?: string
  // SettledAmount field is defined when the order has been filled and the fill amounts have been recorded.
  settledAmounts?: SettledAmount[]
}

export enum SORT_FIELDS {
  CREATED_AT = 'createdAt',
}
