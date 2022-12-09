import Joi from 'joi'
import { OrderEntity, SORT_FIELDS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: FieldValidator.isValidLimit(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  offerer: FieldValidator.isValidEthAddress(),
  sortKey: FieldValidator.isValidSortKey(),
  sort: FieldValidator.isValidSort(),
  filler: FieldValidator.isValidEthAddress(),
  cursor: FieldValidator.isValidCursor(),
})

export type GetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  offerer?: string
  sortKey?: SORT_FIELDS
  sort?: string
  filler?: string
  cursor?: string
}

export type GetOrdersResponse = {
  orders: (OrderEntity | undefined)[]
  cursor?: string
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
  cursor: FieldValidator.isValidCursor(),
})

export enum GET_QUERY_PARAMS {
  LIMIT = 'limit',
  OFFERER = 'offerer',
  ORDER_STATUS = 'orderStatus',
  ORDER_HASH = 'orderHash',
  SORT_KEY = 'sortKey',
  SORT = 'sort',
  FILLER = 'filler',
}
