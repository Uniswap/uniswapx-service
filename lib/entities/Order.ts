export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
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

export enum SUPPORTED_CHAINS {
  MAINNET = 1
}
