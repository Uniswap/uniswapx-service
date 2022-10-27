export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
}

export type OrderEntity = {
  createdAt: number
  encodedOrder: string
  signature: string
  nonce: string
  orderHash: string
  orderStatus: ORDER_STATUS
  offerer?: string
  reactor?: string
  startTime?: number
  endTime?: number
  deadline?: number
  sellToken?: string
  sellAmount?: string
}

export enum TABLE_KEY {
  ORDER_HASH = 'orderHash',
  OFFERER = 'offerer',
  CREATED_AT = 'createdAt',
  ENCODED_ORDER = 'encodedOrder',
  SIGNATURE = 'signature',
  SELL_TOKEN = 'sellToken',
  ORDER_STATUS = 'orderStatus',
  OFFERER_ORDER_STATUS = 'offererOrderStatus',
  OFFERER_SELL_TOKEN = 'offererSellToken',
  SELL_TOKEN_ORDER_STATUS = 'sellTokenOrderStatus',
}
