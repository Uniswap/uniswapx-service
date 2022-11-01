import { ethers } from 'ethers'
import Joi, { CustomHelpers, NumberSchema, StringSchema } from 'joi'
import { ORDER_STATUS } from '../entities'

export default class FieldValidator {
  public static isValidOrderStatus(): StringSchema {
    return Joi.string().valid(
      ORDER_STATUS.OPEN,
      ORDER_STATUS.FILLED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.EXPIRED,
      ORDER_STATUS.ERROR,
      ORDER_STATUS.UNVERIFIED
    )
  }

  public static isValidEthAddress(): StringSchema {
    return Joi.string().custom((value: string, helpers: CustomHelpers<any>) => {
      if (!ethers.utils.getAddress(value)) {
        return helpers.error('VALIDATION ERROR: Invalid address')
      }
      return value
    })
  }

  public static isValidEncodedOrder(): StringSchema {
    return Joi.string().regex(this.getHexiDecimalRegex())
  }

  public static isValidSignature(): StringSchema {
    return Joi.string().regex(this.getHexiDecimalRegex(130))
  }

  public static isValidOrderHash(): StringSchema {
    return Joi.string().regex(this.getHexiDecimalRegex(64))
  }

  public static isValidLimit(): NumberSchema {
    return Joi.number()
  }

  public static isValidCreatedAt(): NumberSchema {
    return Joi.number()
  }

  private static getHexiDecimalRegex(length?: number): RegExp {
    const lengthModifier = length ? `{${length}}` : '*'
    return new RegExp(`^0x[0-9,a-z,A-Z]${lengthModifier}$`)
  }
}
