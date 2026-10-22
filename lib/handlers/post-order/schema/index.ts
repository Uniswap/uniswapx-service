import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

// TODO(andy.smith): update schemas to accept any one of the below formats. For now, just validate the original request body.
export const PostOrderRequestBodyJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(),
  signature: FieldValidator.isValidSignature().required(),
  chainId: FieldValidator.isValidChainId().required(),
  quoteId: FieldValidator.isValidQuoteId(),
  requestId: FieldValidator.isValidQuoteId(),
  orderType: FieldValidator.isValidOrderType(),
})

export const PostOrderResponseJoi = Joi.object({
  hash: FieldValidator.isValidOrderHash(),
})

export type LegacyDutchOrderPostRequestBody = {
  // To maintain backwards compatibility, we assume if an orderType is undefined
  // on the object, this is a legacy DutchOrderRequest. The parser only accepts it
  // as a limit order; decaying V1 orders are rejected.
  orderType: undefined
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

// Still a valid request shape, but the parser rejects it: decaying V1 orders are no longer accepted.
export type DutchV1OrderPostRequestBody = {
  orderType: OrderType.Dutch
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

export type LimitOrderPostRequestBody = {
  orderType: OrderType.Limit
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
}

export type DutchV2OrderPostRequestBody = {
  orderType: OrderType.Dutch_V2
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

export type DutchV3OrderPostRequestBody = {
  orderType: OrderType.Dutch_V3
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

export type PriorityOrderPostRequestBody = {
  orderType: OrderType.Priority
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

export type PostOrderRequestBody =
  | LegacyDutchOrderPostRequestBody
  | DutchV1OrderPostRequestBody
  | DutchV2OrderPostRequestBody
  | DutchV3OrderPostRequestBody
  | LimitOrderPostRequestBody
  | PriorityOrderPostRequestBody

export type PostOrderResponse = {
  hash: string
}
