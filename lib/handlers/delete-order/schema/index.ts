import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

export const DeleteOrderQueryParamsJoi = Joi.object({
  orderHash: FieldValidator.isValidOrderHash(),
})

export type DeleteOrderQueryParams = {
  orderHash: string
}
