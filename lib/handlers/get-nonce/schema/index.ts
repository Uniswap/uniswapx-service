import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

export const GetNonceQueryParamsJoi = Joi.object({
  address: FieldValidator.isValidEthAddress().required(),
})

export type GetNonceQueryParams = {
  address: string
}

export type GetNonceResponse = {
  nonce: string
}

export const GetNonceResponseJoi = Joi.object({
  nonce: FieldValidator.isValidNonce(),
})
