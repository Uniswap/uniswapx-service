import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'
import { DUTCH_LIMIT } from '../../../util/order'

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

// One body for both post routes. Without an orderType it is the legacy V1 encoding, which the parser
// accepts only as a limit order; Dutch and DutchLimit still pass the schema and are rejected there.
export type PostOrderRequestBody = {
  orderType?: OrderType | typeof DUTCH_LIMIT
  chainId: number
  encodedOrder: string
  signature: string
  quoteId?: string
  requestId?: string
}

export type PostOrderResponse = {
  hash: string
}
