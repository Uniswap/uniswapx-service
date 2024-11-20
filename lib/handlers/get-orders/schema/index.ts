import Joi from 'joi'
import { SORT_FIELDS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { GetOrderTypeQueryParamEnum } from './GetOrderTypeQueryParamEnum'

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
  orderType: FieldValidator.isValidGetQueryParamOrderType(),
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
  orderType?: GetOrderTypeQueryParamEnum
}
export type RawGetOrdersQueryParams = SharedGetOrdersQueryParams & {
  swapper?: string
  orderHashes: string
}
export type GetOrdersQueryParams = SharedGetOrdersQueryParams & {
  offerer?: string
  orderHashes?: string[]
}

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
  ORDER_TYPE = 'orderType',
}
