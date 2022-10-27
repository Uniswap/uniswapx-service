import Joi from '@hapi/joi'
import { OrderEntity, ORDER_STATUS } from '../../../entities'

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: Joi.number(),
  orderStatus: Joi.string().valid(
    ORDER_STATUS.OPEN,
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.ERROR,
    ORDER_STATUS.UNVERIFIED
  ),
  orderHash: Joi.string(),
  offerer: Joi.string().length(42),
  sellToken: Joi.string().length(42),
})

export type GetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  offerer?: string
  sellToken?: string
}

export type GetOrdersResponse = {
  orders: Array<OrderEntity>
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

export enum GET_QUERY_PARAMS {
  LIMIT = 'limit',
  SELL_TOKEN = 'sellToken',
  OFFERER = 'offerer',
  ORDER_STATUS = 'orderStatus',
  ORDER_HASH = 'orderHash',
}
