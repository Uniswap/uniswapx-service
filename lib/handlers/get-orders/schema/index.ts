import Joi from 'joi'
import { SORT_FIELDS, UniswapXOrderEntity } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

const sortKeyJoi = FieldValidator.isValidSortKey()

export const GetOrdersQueryParamsJoi = Joi.object({
  limit: FieldValidator.isValidLimit(),
  orderHash: FieldValidator.isValidOrderHash(),
  orderHashes: FieldValidator.isValidOrderHashes(),
  sortKey: FieldValidator.isValidSortKey()
    .when('sort', {
      is: Joi.exist(),
      then: sortKeyJoi.required(),
      otherwise: sortKeyJoi,
    })
    .when('desc', {
      is: Joi.exist(),
      then: sortKeyJoi.required(),
      otherwise: sortKeyJoi,
    }),
  sort: FieldValidator.isValidSort(),
  cursor: FieldValidator.isValidCursor(),
  chainId: FieldValidator.isValidChainId(),
  filler: FieldValidator.isValidEthAddress(),
  swapper: FieldValidator.isValidEthAddress(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  desc: Joi.boolean(),
  includeV2: Joi.boolean(),
})
  .or('orderHash', 'orderHashes', 'chainId', 'orderStatus', 'swapper', 'filler')
  .when('.chainId', {
    is: Joi.exist(),
    then: Joi.object({
      swapper: Joi.forbidden().error(new Error('Querying with both swapper and chainId is not currently supported.')),
    }),
  })
  .when('.sortKey', {
    is: Joi.exist(),
    then: Joi.object({
      orderHashes: Joi.forbidden().error(
        new Error('Querying with both orderHashes and sortKey is not currently supported.')
      ),
    }),
  })

export type SharedGetOrdersQueryParams = {
  limit?: number
  orderStatus?: string
  orderHash?: string
  sortKey?: SORT_FIELDS
  sort?: string
  filler?: string
  cursor?: string
  chainId?: number
  desc?: boolean
}
export type RawGetOrdersQueryParams = SharedGetOrdersQueryParams & {
  swapper?: string
  orderHashes: string
  includeV2?: boolean
}
export type GetOrdersQueryParams = SharedGetOrdersQueryParams & {
  offerer?: string
  orderHashes?: string[]
}

export type GetOrdersResponse = {
  orders: (UniswapXOrderEntity | undefined)[]
  cursor?: string
}

export const OrderInputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount(),
  endAmount: FieldValidator.isValidAmount(),
})

// TODO: use real validations
export const CosignerDataJoi = Joi.object({
  decayStartTime: Joi.any(),
  decayEndTime: Joi.any(),
  exclusiveFiller: Joi.any(), //FieldValidator.isValidEthAddress(),
  inputOverride: Joi.any(), //FieldValidator.isValidAmount(),
  outputOverrides: Joi.any(), //Joi.array().items(FieldValidator.isValidAmount()),
})

export const OrderOutputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  endAmount: FieldValidator.isValidAmount().required(),
  recipient: FieldValidator.isValidEthAddress().required(),
})

export const SettledAmount = Joi.object({
  tokenOut: FieldValidator.isValidEthAddress(),
  amountOut: FieldValidator.isValidAmount(),
  tokenIn: FieldValidator.isValidEthAddress(),
  amountIn: FieldValidator.isValidAmount(),
})

const OrderRepsonseEntryJoiMigrations = {
  chainId: FieldValidator.isValidChainId().valid(12341234),
}

export const OrderResponseEntryJoi = Joi.object({
  createdAt: FieldValidator.isValidCreatedAt(),
  encodedOrder: FieldValidator.isValidEncodedOrder(),
  signature: FieldValidator.isValidSignature(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  swapper: FieldValidator.isValidEthAddress(),
  txHash: FieldValidator.isValidTxHash(),
  type: FieldValidator.isValidOrderType(),
  input: OrderInputJoi,
  outputs: Joi.array().items(OrderOutputJoi),
  settledAmounts: Joi.array().items(SettledAmount),
  chainId: FieldValidator.isValidChainId(),
  quoteId: FieldValidator.isValidQuoteId(),
  cosignerData: CosignerDataJoi,
  cosignature: Joi.any(),
}).keys({
  ...OrderRepsonseEntryJoiMigrations,
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
  ORDER_HASHES = 'orderHashes',
  SORT_KEY = 'sortKey',
  SORT = 'sort',
  FILLER = 'filler',
  CHAIN_ID = 'chainId',
  DESC = 'desc',
}
