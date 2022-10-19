export enum ORDER_STATUS {
  OPEN = 'open',
  NONCE_USED = 'nonceUsed',
  EXPIRED = 'expired',
  ERROR = 'error',
  // these states won't be used until we poll blockchain events
  CANCELLED = 'cancelled',
  FILLED = 'filled',
}

export type Order = {
  createdAt: number
  encodedOrder: string
  signature: string
  orderHash: string
  orderStatus: ORDER_STATUS
  creator: string
  sourceChainId: number
  destinationChainId: number
}
