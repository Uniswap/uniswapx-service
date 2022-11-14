import Joi from 'joi'
import { SupportedChains } from '../../util/chains'
import FieldValidator from '../../util/field-validator'

export const CheckOrderStatusInputJoi = Joi.object({
  orderHash: FieldValidator.isValidOrderHash().required(),
  orderStatus: Joi.string()
    .valid('open', 'expired', 'error', 'cancelled', 'filled', 'unverified', 'insufficient-funds')
    .required(),
  chainId: Joi.number()
    .valid(...Object.values(SupportedChains))
    .required(),
  lastBlockNumber: Joi.number().greater(0),
  retryCount: Joi.number().min(0),
})
