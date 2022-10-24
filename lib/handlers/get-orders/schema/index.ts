import Joi from '@hapi/joi'
import { Order, ORDER_STATUS } from '../../types/order'

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: Joi.number(),
  orderStatus: Joi.string().valid(
    ORDER_STATUS.OPEN,
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.NONCE_USED,
    ORDER_STATUS.ERROR,
    ORDER_STATUS.UNVERIFIED
  ),
  orderHash: Joi.string(),
  orderType: Joi.string().valid('dutch-limit'),
  offerer: Joi.string().length(42),
  sellToken: Joi.string().length(42),
  chainId: Joi.number().greater(0),
  buyToken: Joi.string().length(42),
  deadline: Joi.string(),
})

export type GetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  offerer?: string
  sellToken?: string
  chainId?: number
  buyToken?: string
  deadline?: string
}

export type GetOrdersResponse = {
  orders: Array<Order>
}

export const OrderResponseEntryJoi = Joi.object({
  createdAt: Joi.number(),
  encodedOrder: Joi.string(),
  signature: Joi.string(),
  orderStatus: Joi.string(),
  orderHash: Joi.string(),
  offerer: Joi.string(),
})

export const GetOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(OrderResponseEntryJoi),
})
