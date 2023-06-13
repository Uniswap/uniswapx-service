import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

export const GetNonceQueryParamsJoi = Joi.object({
  address: FieldValidator.isValidEthAddress().required(),
  chainId: FieldValidator.isValidChainId(),
})

export type GetNonceQueryParams = {
  address: string
  chainId?: number
}

export type GetNonceResponse = {
  nonce: string
}

export const GetNonceResponseJoi = Joi.object({
  nonce: FieldValidator.isValidNonce(),
})
