export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
  INSUFFICIENT_FUNDS = 'insufficient-funds',
}

export type OrderEntity = {
  encodedOrder: string
  signature: string
  nonce: string
  orderHash: string
  orderStatus: ORDER_STATUS
  offerer: string
  reactor?: string
  startTime?: number
  endTime?: number
  deadline?: number
  sellToken?: string
  sellAmount?: string
}

export enum SORT_FIELDS {
  DEADLINE = 'deadline',
  CREATED_AT = 'createdAt',
}
