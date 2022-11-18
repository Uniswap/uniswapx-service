import { TABLE_KEY } from '../config/dynamodb'

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

export const getValidKeys = (index: string | undefined) => {
  switch (index) {
    case 'offererIndex':
      return [TABLE_KEY.OFFERER, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'orderStatusIndex':
      return [TABLE_KEY.ORDER_STATUS, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'sellTokenIndex':
      return [TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'offererOrderStatusIndex':
      return [TABLE_KEY.OFFERER_ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.ORDER_HASH]
    case 'offererSellTokenIndex':
      return [TABLE_KEY.OFFERER_SELL_TOKEN, TABLE_KEY.ORDER_HASH]
    case 'sellTokenOrderStatusIndex':
      return [TABLE_KEY.SELL_TOKEN_ORDER_STATUS, TABLE_KEY.ORDER_HASH]
    default:
      return [TABLE_KEY.ORDER_HASH]
  }
}
