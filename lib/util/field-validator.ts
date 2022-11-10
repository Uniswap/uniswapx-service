import { ethers } from 'ethers'
import Joi, { CustomHelpers, NumberSchema, StringSchema } from 'joi'
import { ORDER_STATUS, SORT_FIELDS } from '../entities'

export const SORT_REGEX = /(\w+)\(([0-9]+)(?:,([0-9]+))?\)/

export default class FieldValidator {
  private static readonly ENCODED_ORDER_JOI = Joi.string().regex(this.getHexiDecimalRegex(2000, true))
  private static readonly SIGNATURE_JOI = Joi.string().regex(this.getHexiDecimalRegex(130))
  private static readonly ORDER_HASH_JOI = Joi.string().regex(this.getHexiDecimalRegex(64))
  private static readonly NONCE_JOI = Joi.string()
    .min(1)
    .max(78) // 2^256 - 1 in base 10 is 78 digits long
    .regex(/^[0-9]+$/)
  private static readonly NUMBER_JOI = Joi.number()
  private static readonly ORDER_STATUS_JOI = Joi.string().valid(
    ORDER_STATUS.OPEN,
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.ERROR,
    ORDER_STATUS.UNVERIFIED
  )
  private static readonly SORT_KEY_JOI = Joi.string().valid(SORT_FIELDS.CREATED_AT, SORT_FIELDS.DEADLINE)
  private static readonly SORT_JOI = Joi.string().regex(SORT_REGEX)

  private static readonly ETH_ADDRESS_JOI = Joi.string().custom((value: string, helpers: CustomHelpers<any>) => {
    if (!ethers.utils.isAddress(value)) {
      return helpers.message({ custom: 'VALIDATION ERROR: Invalid address' })
    }
    return value
  })

  public static isValidOrderStatus(): StringSchema {
    return this.ORDER_STATUS_JOI
  }

  public static isValidEthAddress(): StringSchema {
    return this.ETH_ADDRESS_JOI
  }

  public static isValidEncodedOrder(): StringSchema {
    return this.ENCODED_ORDER_JOI
  }

  public static isValidSignature(): StringSchema {
    return this.SIGNATURE_JOI
  }

  public static isValidOrderHash(): StringSchema {
    return this.ORDER_HASH_JOI
  }

  public static isValidLimit(): NumberSchema {
    return this.NUMBER_JOI
  }

  public static isValidCreatedAt(): NumberSchema {
    return this.NUMBER_JOI
  }

  public static isValidSortKey(): StringSchema {
    return this.SORT_KEY_JOI
  }

  public static isValidSort(): StringSchema {
    return this.SORT_JOI
  }

  public static isValidNonce(): StringSchema {
    return this.NONCE_JOI
  }

  private static getHexiDecimalRegex(length?: number, maxLength = false): RegExp {
    let lengthModifier = '*'
    if (length) {
      lengthModifier = maxLength ? `{0,${length}}` : `{${length}}`
    }
    return new RegExp(`^0x[0-9,a-z,A-Z]${lengthModifier}$`)
  }
}
