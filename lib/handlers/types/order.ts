export enum ORDER_STATUS {
  OPEN = 'open',
  NONCE_USED = 'nonceUsed',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
}

export type Order = {
  createdAt: number
  encodedOrder: string
  signature: string
  orderHash: string
  orderStatus: ORDER_STATUS
  offerer: string
}
