import { OrderValidation } from 'gouda-sdk'
import { ORDER_STATUS } from '../handlers/types/order'

export const TERMINAL_STATES = new Set([
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.ERROR,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FILLED,
])

export const computeNextState = (orderStatus: ORDER_STATUS, validation: OrderValidation): ORDER_STATUS => {
  if (TERMINAL_STATES.has(orderStatus)) {
    // Order is in terminal state
    return orderStatus
  }
  switch (validation) {
    case OrderValidation.OK:
    case OrderValidation.InsufficientFunds:
      return ORDER_STATUS.OPEN
    case OrderValidation.Expired:
      return ORDER_STATUS.EXPIRED
    case OrderValidation.InvalidSignature:
    case OrderValidation.InvalidOrderFields:
    case OrderValidation.UnknownError:
    default:
      return ORDER_STATUS.ERROR
  }
}

