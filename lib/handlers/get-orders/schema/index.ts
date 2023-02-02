import Joi from 'joi'
import { OrderEntity, SORT_FIELDS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

const indexKeyJoi = Joi.object({
  orderStatus: FieldValidator.isValidOrderStatus(),
  offerer: FieldValidator.isValidEthAddress(),
  filler: FieldValidator.isValidEthAddress(),
})

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: FieldValidator.isValidLimit(),
  orderHash: FieldValidator.isValidOrderHash(),
  sortKey: FieldValidator.isValidSortKey().when('sort', {
    is: Joi.exist(),
    then: FieldValidator.isValidSortKey().required(),
    otherwise: FieldValidator.isValidSortKey(),
  }),
  sort: FieldValidator.isValidSort(),
  cursor: FieldValidator.isValidCursor(),
}).when('.sortKey', {
  is: Joi.exist(),
  then: indexKeyJoi.or('orderStatus', 'offerer', 'filler'),
  otherwise: indexKeyJoi,
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
