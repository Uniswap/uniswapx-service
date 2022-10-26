import { SignedOrder, parseOrder } from 'gouda-sdk'

export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  UNVERIFIED = 'unverified',
  ERROR = 'error',
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

export const APIOrderToSDKSignedOrder = (order: Order): SignedOrder => {
  return { order: parseOrder(order.encodedOrder), signature: order.signature }
}
