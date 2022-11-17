import Joi from 'joi'
import FieldValidator from '../../util/field-validator'

export const CheckOrderStatusInputJoi = Joi.object({
  orderHash: FieldValidator.isValidOrderHash().required(),
  orderStatus: FieldValidator.isValidOrderStatus().required(),
  chainId: FieldValidator.isValidChainId().required(),
})
