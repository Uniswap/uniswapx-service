import { OrderType } from 'gouda-sdk'

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
  isFeeOutput?: boolean
  recipient?: string
}

export type FinalOutput = {
  tokenOut: string
  amountOut: string
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
  reactor?: string
  startTime?: number
  endTime?: number
  deadline?: number
  filler?: string
  quoteId?: string
  txHash?: string
  input?: OrderInput
  outputs?: OrderOutput[]
  finalOutputs?: FinalOutput[]
}

export enum SORT_FIELDS {
  CREATED_AT = 'createdAt',
}
