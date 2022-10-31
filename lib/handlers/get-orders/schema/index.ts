import Joi from '@hapi/joi'
import { OrderEntity } from '../../../entities'
import { FieldValidator } from '../../../util/field-validator'

const fieldValidator = new FieldValidator()

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: fieldValidator.isValidLimit(),
  orderStatus: fieldValidator.isValidOrderStatus(),
  orderHash: fieldValidator.isValidOrderHash(),
  offerer: fieldValidator.isValidEthAddress(),
  sellToken: fieldValidator.isValidEthAddress(),
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
  createdAt: fieldValidator.isValidCreatedAt(),
  encodedOrder: fieldValidator.isValidEncodedOrder(),
  signature: fieldValidator.isValidSignature(),
  orderStatus: fieldValidator.isValidOrderStatus(),
  orderHash: fieldValidator.isValidOrderHash(),
  offerer: fieldValidator.isValidEthAddress(),
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
