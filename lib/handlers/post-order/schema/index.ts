import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

export const PostOrderRequestBodyJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(), // Joi doesn't support 0x-prefixed hex strings
  signature: FieldValidator.isValidSignature().required(),
  chainId: FieldValidator.isValidChainId().required(),
})

export const PostOrderResponseJoi = Joi.object({
  hash: FieldValidator.isValidOrderHash(),
})

export type PostOrderRequestBody = {
  encodedOrder: string
  signature: string
  chainId: number
}

export type PostOrderResponse = {
  hash: string
}
