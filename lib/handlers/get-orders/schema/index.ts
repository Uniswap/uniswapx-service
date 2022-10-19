import Joi from '@hapi/joi'
import { Order } from '../../types/order'

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: Joi.number(),
  orderStatus: Joi.string().valid('open', 'filled', 'cancelled', 'expired', 'nonceUsed', 'error'),
  orderHash: Joi.string(),
  orderType: Joi.string().valid('dutch-limit'),
  creator: Joi.string().length(42),
  sellToken: Joi.string().length(42),
  chainId: Joi.number().greater(0),
  buyToken: Joi.string().length(42),
  deadline: Joi.string(),
})

export type GetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  creator?: string
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
  creator: Joi.string(),
})

export const GetOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(OrderResponseEntryJoi),
})
