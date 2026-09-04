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
  // on the object, this is a legacy DutchOrderRequest which means it can either be a
  // Dutch order or a limit order. The order type will be decided by the parser.
  orderType: undefined
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

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

export type RelayOrderPostRequestBody = {
  orderType: OrderType.Relay
  chainId: number
  encodedOrder: string
  signature: string
}

export type PostOrderRequestBody =
  | LegacyDutchOrderPostRequestBody
  | DutchV1OrderPostRequestBody
  | DutchV2OrderPostRequestBody
  | DutchV3OrderPostRequestBody
  | LimitOrderPostRequestBody
  | RelayOrderPostRequestBody
  | PriorityOrderPostRequestBody

export type PostOrderResponse = {
  hash: string
}
