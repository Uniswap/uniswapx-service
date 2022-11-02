import Joi from 'joi'
import { OrderEntity } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: FieldValidator.isValidLimit(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  offerer: FieldValidator.isValidEthAddress(),
  sellToken: FieldValidator.isValidEthAddress(),
})

export type GetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  offerer?: string
  sellToken?: string
}

export type GetOrdersResponse = {
  orders: (OrderEntity | undefined)[]
}

export const OrderResponseEntryJoi = Joi.object({
  createdAt: FieldValidator.isValidCreatedAt(),
  encodedOrder: FieldValidator.isValidEncodedOrder(),
  signature: FieldValidator.isValidSignature(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  offerer: FieldValidator.isValidEthAddress(),
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
