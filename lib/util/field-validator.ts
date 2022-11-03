import { ethers } from 'ethers'
import Joi, { CustomHelpers, NumberSchema, StringSchema } from 'joi'
import { ORDER_STATUS } from '../entities'
import { SUPPORTED_CHAINS } from './chain'

export default class FieldValidator {
  private static readonly ENCODED_ORDER_JOI = Joi.string().regex(this.getHexiDecimalRegex(2000, true))
  private static readonly SIGNATURE_JOI = Joi.string().regex(this.getHexiDecimalRegex(130))
  private static readonly ORDER_HASH_JOI = Joi.string().regex(this.getHexiDecimalRegex(64))
  private static readonly NUMBER_JOI = Joi.number()
  private static readonly CHAIN_ID_JOI = Joi.number().valid(...SUPPORTED_CHAINS)
  private static readonly ORDER_STATUS_JOI = Joi.string().valid(
    ORDER_STATUS.OPEN,
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.ERROR,
    ORDER_STATUS.UNVERIFIED
  )

  private static readonly ETH_ADDRESS_JOI = Joi.string().custom((value: string, helpers: CustomHelpers<any>) => {
    if (!ethers.utils.getAddress(value)) {
      return helpers.error('VALIDATION ERROR: Invalid address')
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

  public static isValidChainId(): NumberSchema {
    return this.CHAIN_ID_JOI
  }

  private static getHexiDecimalRegex(length?: number, maxLength = false): RegExp {
    let lengthModifier = '*'
    if (length) {
      lengthModifier = maxLength ? `{0,${length}}` : `{${length}}`
    }
    return new RegExp(`^0x[0-9,a-z,A-Z]${lengthModifier}$`)
  }
}
