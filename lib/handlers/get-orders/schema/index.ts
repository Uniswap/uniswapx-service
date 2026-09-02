import Joi from 'joi'
import { SORT_FIELDS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { GetOrderTypeQueryParamEnum } from './GetOrderTypeQueryParamEnum'

// Filters shared by GET /orders and GET /limit-orders. Every value that can end up in a
// DynamoDB partition key is either enum-checked (chainId against SUPPORTED_CHAINS,
// orderStatus against ORDER_STATUS) or shape-checked (addresses, pair, hashes), so a caller
// cannot mint arbitrary partition keys -- and the repository only caches partitions built
// from the enum-checked ones.
const filterKeys = {
  limit: FieldValidator.isValidLimit(),
  orderHash: FieldValidator.isValidOrderHash(),
  orderHashes: FieldValidator.isValidOrderHashes(),
  chainId: FieldValidator.isValidChainId(),
  filler: FieldValidator.isValidEthAddress(),
  swapper: FieldValidator.isValidEthAddress(),
  orderStatus: FieldValidator.isValidOrderStatuses(),
  orderType: FieldValidator.isValidGetQueryParamOrderType(),
  executeAddress: FieldValidator.isValidEthAddress(),
  pair: FieldValidator.isValidPair(),
}

const requireOneFilter = (schema: Joi.ObjectSchema): Joi.ObjectSchema =>
  schema.or('orderHash', 'orderHashes', 'chainId', 'orderStatus', 'swapper', 'filler', 'pair').when('.chainId', {
    is: Joi.exist(),
    then: Joi.object({
      swapper: Joi.forbidden().error(new Error('Querying with both swapper and chainId is not currently supported.')),
    }),
  })

// GET /orders returns a single page of the newest orders (createdAt descending, at most
// MAX_ORDERS). `cursor`, `sortKey`, `sort` and `desc` used to select other pages or
// orderings; they are deliberately absent here, so the base handler's stripUnknown drops
// them and a client still sending them gets the default page rather than a 400.
//
// The reason is capacity: every distinct (limit, cursor, sort) combination was its own
// DynamoDB read and its own entry in the get-orders query cache. A single fixed page keeps
// the read rate on the hot chainId_orderStatus partitions independent of how varied the
// polling traffic is. Ordering is fixed for the same reason.
export const GetOrdersQueryParamsJoi = requireOneFilter(Joi.object(filterKeys))

// GET /limit-orders keeps cursor pagination and sort controls: a chain can carry far more
// open limit orders than fit in one page, and fillers walk the whole set.
const sortKeyJoi = FieldValidator.isValidSortKey()

export const GetLimitOrdersQueryParamsJoi = requireOneFilter(
  Joi.object({
    ...filterKeys,
    sortKey: sortKeyJoi
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
    desc: Joi.boolean(),
  })
).when('.sortKey', {
  is: Joi.exist(),
  then: Joi.object({
    orderHashes: Joi.forbidden().error(
      new Error('Querying with both orderHashes and sortKey is not currently supported.')
    ),
  }),
})

export type SharedGetOrdersQueryParams = {
  limit?: number
  orderHash?: string
  sortKey?: SORT_FIELDS
  sort?: string
  filler?: string
  cursor?: string
  chainId?: number
  desc?: boolean
  orderType?: GetOrderTypeQueryParamEnum
  executeAddress?: string
  pair?: string
}
export type RawGetOrdersQueryParams = SharedGetOrdersQueryParams & {
  orderStatus?: string
  swapper?: string
  orderHashes: string
}
export type GetOrdersQueryParams = SharedGetOrdersQueryParams & {
  orderStatus?: string | string[]
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
  EXECUTE_ADDRESS = 'executeAddress',
  PAIR = 'pair',
}
