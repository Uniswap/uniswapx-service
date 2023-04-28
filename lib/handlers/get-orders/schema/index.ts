import Joi from 'joi'
import { OrderEntity, SORT_FIELDS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

const indexKeyJoi = Joi.object({
  orderStatus: FieldValidator.isValidOrderStatus(),
  offerer: FieldValidator.isValidEthAddress(),
  filler: FieldValidator.isValidEthAddress(),
})
const sortKeyJoi = FieldValidator.isValidSortKey()

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: FieldValidator.isValidLimit(),
  orderHash: FieldValidator.isValidOrderHash(),
  sortKey: FieldValidator.isValidSortKey().when('sort', {
    is: Joi.exist(),
    then: sortKeyJoi.required(),
    otherwise: sortKeyJoi,
  }),
  sort: FieldValidator.isValidSort(),
  cursor: FieldValidator.isValidCursor(),
  chainId: FieldValidator.isValidChainId(),
  desc: Joi.boolean(),
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
  chainId?: number
  desc?: boolean
}

export type GetOrdersResponse = {
  orders: (OrderEntity | undefined)[]
  cursor?: string
}

export const OrderInputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount(),
  endAmount: FieldValidator.isValidAmount(),
})

export const OrderOutputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount(),
  endAmount: FieldValidator.isValidAmount(),
  recipient: FieldValidator.isValidEthAddress(),
})

export const SettledAmount = Joi.object({
  tokenOut: FieldValidator.isValidEthAddress(),
  amountOut: FieldValidator.isValidAmount(),
  tokenIn: FieldValidator.isValidEthAddress(),
  amountIn: FieldValidator.isValidAmount(),
})

export const OrderResponseEntryJoi = Joi.object({
  createdAt: FieldValidator.isValidCreatedAt(),
  encodedOrder: FieldValidator.isValidEncodedOrder(),
  signature: FieldValidator.isValidSignature(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  offerer: FieldValidator.isValidEthAddress(),
  txHash: FieldValidator.isValidTxHash(),
  type: FieldValidator.isValidOrderType(),
  input: OrderInputJoi,
  outputs: Joi.array().items(OrderOutputJoi),
  settledAmounts: Joi.array().items(SettledAmount),
  chainId: FieldValidator.isValidChainId(),
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
  CHAIN_ID = 'chainId',
  DESC = 'desc',
}
