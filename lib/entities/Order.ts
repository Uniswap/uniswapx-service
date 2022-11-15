import { TABLE_KEY } from '../config/dynamodb'

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

export enum SORT_FIELDS {
  DEADLINE = 'deadline',
  CREATED_AT = 'createdAt',
}

export const getValidKeys = (index: string | undefined) => {
  switch (index) {
    case 'offerer-createdAt-index':
      return [TABLE_KEY.OFFERER, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'orderStatus-createdAt-index':
      return [TABLE_KEY.ORDER_STATUS, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'sellToken-createdAt-index':
      return [TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]
    case 'offererOrderStatus-createdAt-index':
      return [TABLE_KEY.OFFERER_ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT]
    case 'offererSellToken-createdAt-index':
      return [TABLE_KEY.OFFERER_SELL_TOKEN, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT]
    case 'sellTokenOrderStatus-createdAt-index':
      return [TABLE_KEY.SELL_TOKEN_ORDER_STATUS, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT]
    case 'offerer-deadline-index':
      return [TABLE_KEY.OFFERER, TABLE_KEY.DEADLINE, TABLE_KEY.ORDER_HASH]
    case 'orderStatus-deadline-index':
      return [TABLE_KEY.ORDER_STATUS, TABLE_KEY.DEADLINE, TABLE_KEY.ORDER_HASH]
    case 'sellToken-deadline-index':
      return [TABLE_KEY.SELL_TOKEN, TABLE_KEY.DEADLINE, TABLE_KEY.ORDER_HASH]
    case 'offererOrderStatus-deadline-index':
      return [TABLE_KEY.OFFERER_ORDER_STATUS, TABLE_KEY.DEADLINE, TABLE_KEY.ORDER_HASH]
    case 'offererSellToken-deadline-index':
      return [TABLE_KEY.OFFERER_SELL_TOKEN, TABLE_KEY.DEADLINE]
    case 'sellTokenOrderStatus-deadline-index':
      return [TABLE_KEY.SELL_TOKEN_ORDER_STATUS, TABLE_KEY.DEADLINE]
    default:
      return [TABLE_KEY.ORDER_HASH]
  }
}
