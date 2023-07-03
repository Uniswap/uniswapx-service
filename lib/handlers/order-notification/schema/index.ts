import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'

export const OrderNotificationInputJoi = Joi.object({
  Records: Joi.array()
    .items(
      Joi.object({
        eventName: Joi.string().required(),
        dynamodb: Joi.object({
          NewImage: Joi.object({
            filler: Joi.object({ S: FieldValidator.isValidEthAddress() }),
            swapper: Joi.object({ S: FieldValidator.isValidEthAddress().required() }).required(),
            orderHash: Joi.object({ S: FieldValidator.isValidOrderHash().required() }).required(),
            encodedOrder: Joi.object({ S: FieldValidator.isValidEncodedOrder().required() }).required(),
            orderStatus: Joi.object({ S: FieldValidator.isValidOrderStatus().required() }).required(),
            signature: Joi.object({ S: FieldValidator.isValidSignature().required() }).required(),
          }).required(),
        }).required(),
      })
    )
    .required(),
})
