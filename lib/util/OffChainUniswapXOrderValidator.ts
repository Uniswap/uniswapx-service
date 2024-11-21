import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchInput,
  DutchOrder,
  DutchOutput,
  NonlinearDutchDecay,
  OrderType,
  PriorityInput,
  PriorityOutput,
  REACTOR_ADDRESS_MAPPING,
  V3DutchInput,
  V3DutchOutput,
} from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import Joi from 'joi'
import { ONE_DAY_IN_SECONDS } from './constants'
import FieldValidator from './field-validator'
import { OrderValidationResponse } from './OrderValidationResponse'

export type SkipValidationMap = {
  SkipDecayStartTimeValidation: boolean
}

export class OffChainUniswapXOrderValidator {
  constructor(
    private readonly getCurrentTime: () => number,
    private readonly deadlineValidityPeriodSeconds = ONE_DAY_IN_SECONDS,
    private readonly skipValidationMap?: SkipValidationMap
  ) {}

  validate(order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder): OrderValidationResponse {
    let orderType
    if (order instanceof DutchOrder) {
      orderType = OrderType.Dutch
    } else if (order instanceof CosignedV2DutchOrder) {
      orderType = OrderType.Dutch_V2
    } else if (order instanceof CosignedV3DutchOrder) {
      orderType = OrderType.Dutch_V3
    } else if (order instanceof CosignedPriorityOrder) {
      orderType = OrderType.Priority
    } else {
      return {
        valid: false,
        errorString: 'Invalid orderType',
      }
    }

    if (orderType == OrderType.Dutch_V2 || orderType == OrderType.Dutch_V3) {
      const cosignerValidation = this.validateCosigner((order as CosignedV2DutchOrder | CosignedV3DutchOrder).info.cosigner)
      if (!cosignerValidation.valid) {
        return cosignerValidation
      }
    }

    if (orderType == OrderType.Priority) {
      const priorityCosignerValidation = this.validatePriorityCosigner((order as CosignedPriorityOrder).info.cosigner)
      if (!priorityCosignerValidation.valid) {
        return priorityCosignerValidation
      }
    }

    const chainIdValidation = this.validateChainId(order.chainId)
    if (!chainIdValidation.valid) {
      return chainIdValidation
    }

    const reactorAddressValidation = this.validateReactorAddress(order.info.reactor, order.chainId, orderType)
    if (!reactorAddressValidation.valid) {
      return reactorAddressValidation
    }

    const deadlineValidation = this.validateDeadline(order.info.deadline)
    if (!deadlineValidation.valid) {
      return deadlineValidation
    }

    //TODO: split validator to multiple classes
    if (!this.skipValidationMap || !this.skipValidationMap.SkipDecayStartTimeValidation) {
      let decayStartTime = 0
      if ((order as DutchOrder).info.decayStartTime) {
        decayStartTime = (order as DutchOrder).info.decayStartTime
      } else if ((order as CosignedV2DutchOrder).info.cosignerData) {
        decayStartTime = (order as CosignedV2DutchOrder).info.cosignerData.decayStartTime
      }
      const decayStartTimeValidation = this.validateDecayStartTime(decayStartTime, order.info.deadline)
      if (!decayStartTimeValidation.valid) {
        return decayStartTimeValidation
      }
    }

    const nonceValidation = this.validateNonce(order.info.nonce)
    if (!nonceValidation.valid) {
      return nonceValidation
    }

    const swapperValidation = this.validateSwapper(order.info.swapper)
    if (!swapperValidation.valid) {
      return swapperValidation
    }

    const reactorValidation = this.validateReactor(order.info.reactor)
    if (!reactorValidation.valid) {
      return reactorValidation
    }

    const inputTokenValidation = this.validateInputToken(order.info.input.token)
    if (!inputTokenValidation.valid) {
      return inputTokenValidation
    }

    if (orderType == OrderType.Priority) {
      const input = order.info.input as PriorityInput
      const inputAmountValidation = this.validateInputAmount(input.amount)
      if (!inputAmountValidation.valid) {
        return inputAmountValidation
      }
      const inputMpsValidation = this.validateMpsPerPriorityFeeWei(input.mpsPerPriorityFeeWei)
      if (!inputMpsValidation.valid) {
        return inputMpsValidation
      }

      const outputs = order.info.outputs as PriorityOutput[]
      const outputsValidation = this.validatePriorityOutputs(outputs)
      if (!outputsValidation.valid) {
        return outputsValidation
      }
    } else if (orderType == OrderType.Dutch_V3) {
      const input = order.info.input as V3DutchInput
      const inputStartAmountValidation = this.validateInputAmount(input.startAmount)
      if (!inputStartAmountValidation.valid) {
        return inputStartAmountValidation
      }

      const curveValidation = this.validateV3Curve(input.curve)
      if (!curveValidation.valid) {
        return curveValidation
      }

      const inputMaxAmountValidation = this.validateInputAmount(input.maxAmount)
      if (!inputMaxAmountValidation.valid) {
        return inputMaxAmountValidation
      }
      if (input.startAmount.gt(input.maxAmount)) {
        return {
          valid: false,
          errorString: `Invalid maxAmount < startAmount`,
        }
      }

      const outputsValidation = this.validateV3DutchOutputs(order.info.outputs as V3DutchOutput[])
      if (!outputsValidation.valid) {
        return outputsValidation
      }
    } else {
      const input = order.info.input as DutchInput
      const inputStartAmountValidation = this.validateInputAmount(input.startAmount)
      if (!inputStartAmountValidation.valid) {
        return inputStartAmountValidation
      }

      const inputEndAmountValidation = this.validateInputAmount(input.endAmount)
      if (!inputEndAmountValidation.valid) {
        return inputStartAmountValidation
      }

      const outputsValidation = this.validateDutchOutputs(order.info.outputs as DutchOutput[])
      if (!outputsValidation.valid) {
        return outputsValidation
      }
    }

    const orderHashValidation = this.validateHash(order.hash())
    if (!orderHashValidation.valid) {
      return orderHashValidation
    }
    return {
      valid: true,
    }
  }

  private validateChainId(chainId: number): OrderValidationResponse {
    const error = FieldValidator.isValidChainId().validate(chainId).error
    if (error) {
      return {
        valid: false,
        errorString: error.message,
      }
    }
    return {
      valid: true,
    }
  }

  private validateReactorAddress(
    reactor: string,
    chainId: number,
    orderType: OrderType | undefined
  ): OrderValidationResponse {
    if (!orderType || reactor.toLowerCase() != REACTOR_ADDRESS_MAPPING[chainId][orderType]!.toLowerCase()) {
      return {
        valid: false,
        errorString: `Invalid reactor address`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateDeadline(deadline: number): OrderValidationResponse {
    if (deadline < this.getCurrentTime()) {
      return {
        valid: false,
        errorString: 'Deadline must be in the future',
      }
    }
    if (deadline > this.getCurrentTime() + this.deadlineValidityPeriodSeconds) {
      return {
        valid: false,
        errorString: `Deadline field invalid: Order expiry cannot be larger than ${
          this.deadlineValidityPeriodSeconds / 60
        } minutes`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateDecayStartTime(decayStartTime: number, deadline: number): OrderValidationResponse {
    if (decayStartTime > deadline) {
      return {
        valid: false,
        errorString: 'Invalid decayStartTime: decayStartTime > deadline',
      }
    }
    return {
      valid: true,
    }
  }

  private validateNonce(nonce: BigNumber): OrderValidationResponse {
    const error = FieldValidator.isValidNonce().validate(nonce.toString()).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid nonce: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateSwapper(swapper: string): OrderValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(swapper).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid swapper: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateCosigner(cosigner: string): OrderValidationResponse {
    const error = FieldValidator.isValidCosigner().validate(cosigner).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid cosigner: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validatePriorityCosigner(cosigner: string): OrderValidationResponse {
    const error = FieldValidator.isValidPriorityCosigner().validate(cosigner).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid priority order cosigner: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  // TODO: Once deployed contracts are finalized, we can restrict this
  // to check against a known set of addresses.
  private validateReactor(reactor: string): OrderValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(reactor).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid reactor: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateInputToken(token: string): OrderValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(token).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid input token: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateInputAmount(amount: BigNumber): OrderValidationResponse {
    if (!this.isValidUint256(amount)) {
      return {
        valid: false,
        errorString: `Invalid input amount: ${amount.toString()}`,
      }
    }
    return {
      valid: true,
    }
  }

  private validateDutchOutputs(outputs: DutchOutput[]): OrderValidationResponse {
    if (outputs.length == 0) {
      return {
        valid: false,
        errorString: `Invalid number of outputs: 0`,
      }
    }
    for (const output of outputs) {
      const { token, recipient, startAmount, endAmount } = output
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          valid: false,
          errorString: `Invalid output token ${token}`,
        }
      }

      if (FieldValidator.isValidEthAddress().validate(recipient).error) {
        return {
          valid: false,
          errorString: `Invalid recipient ${recipient}`,
        }
      }

      if (!this.isValidUint256(startAmount)) {
        return {
          valid: false,
          errorString: `Invalid startAmount ${startAmount.toString()}`,
        }
      }

      if (!this.isValidUint256(endAmount)) {
        return {
          valid: false,
          errorString: `Invalid endAmount ${endAmount.toString()}`,
        }
      }

      if (endAmount.gt(startAmount)) {
        return {
          valid: false,
          errorString: `Invalid endAmount > startAmount`,
        }
      }
    }
    return {
      valid: true,
    }
  }


  private validateV3DutchOutputs(outputs: V3DutchOutput[]): OrderValidationResponse {
    if (outputs.length == 0) {
      return {
        valid: false,
        errorString: `Invalid number of outputs: 0`,
      }
    }
    for (const output of outputs) {
      const { token, recipient, startAmount, curve, minAmount } = output
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          valid: false,
          errorString: `Invalid output token ${token}`,
        }
      }

      if (FieldValidator.isValidEthAddress().validate(recipient).error) {
        return {
          valid: false,
          errorString: `Invalid recipient ${recipient}`,
        }
      }

      if (!this.isValidUint256(startAmount)) {
        return {
          valid: false,
          errorString: `Invalid startAmount ${startAmount.toString()}`,
        }
      }

      if (!this.isValidUint256(minAmount)) {
        return {
          valid: false,
          errorString: `Invalid minAmount ${minAmount.toString()}`,
        }
      }

      if (minAmount.gt(startAmount)) {
        return {
          valid: false,
          errorString: `Invalid minAmount > startAmount`,
        }
      }

      const curveValidation = this.validateV3Curve(curve)
      if (!curveValidation.valid) {
        return curveValidation
      }
    }
    return {
      valid: true,
    }
  }

  private validateMpsPerPriorityFeeWei(mpsPerPriorityFeeWei: BigNumber): OrderValidationResponse {
    const error = Joi.number().min(0).validate(mpsPerPriorityFeeWei.toString()).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid mpsPerPriorityFeeWei: ${error}; must >= 0`,
      }
    }
    return {
      valid: true,
    }
  }

  private validatePriorityOutputs(priorityOutputs: PriorityOutput[]): OrderValidationResponse {
    if (priorityOutputs.length == 0) {
      return {
        valid: false,
        errorString: `Invalid number of outputs: 0`,
      }
    }
    for (const output of priorityOutputs) {
      const { token, recipient, amount, mpsPerPriorityFeeWei } = output
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          valid: false,
          errorString: `Invalid output token ${token}`,
        }
      }

      if (FieldValidator.isValidEthAddress().validate(recipient).error) {
        return {
          valid: false,
          errorString: `Invalid recipient ${recipient}`,
        }
      }

      if (!this.isValidUint256(amount)) {
        return {
          valid: false,
          errorString: `Invalid startAmount ${amount.toString()}`,
        }
      }

      const error = Joi.number().min(0).validate(mpsPerPriorityFeeWei.toString()).error
      if (error) {
        return {
          valid: false,
          errorString: `Invalid mpsPerPriorityFeeWei: ${error}; must >= 0`,
        }
      }
    }
    return {
      valid: true,
    }
  }

  private validateHash(orderHash: string): OrderValidationResponse {
    const error = FieldValidator.isValidOrderHash().validate(orderHash).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid orderHash: ${error}`,
      }
    }
    return {
      valid: true,
    }
  }

  private isValidUint256(value: BigNumber) {
    return value.gte(0) && value.lt(BigNumber.from(1).shl(256))
  }

  private validateV3Curve(curve: NonlinearDutchDecay): OrderValidationResponse {
    return curve.relativeAmounts.length == curve.relativeBlocks.length
      ? { valid: true }
      : { valid: false, errorString: 'Invalid curve: relativeAmounts.length != relativeBlocks.length' }
  }
}
