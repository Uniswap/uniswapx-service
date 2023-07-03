import { DutchOrder, DutchOutput } from '@uniswap/gouda-sdk'
import { BigNumber } from 'ethers'
import FieldValidator from './field-validator'

export type OrderValidationResponse = {
  valid: boolean
  errorString?: string
}

const THIRTY_MINUTES_IN_SECONDS = 60 * 30

export class OrderValidator {
  constructor(private readonly getCurrentTime: () => number) {}

  validate(order: DutchOrder): OrderValidationResponse {
    const chainIdValidation = this.validateChainId(order.chainId)
    if (!chainIdValidation.valid) {
      return chainIdValidation
    }

    const deadlineValidation = this.validateDeadline(order.info.deadline)
    if (!deadlineValidation.valid) {
      return deadlineValidation
    }

    const decayStartTimeValidation = this.validatedecayStartTime(order.info.decayStartTime, order.info.deadline)
    if (!decayStartTimeValidation.valid) {
      return decayStartTimeValidation
    }

    const nonceValidation = this.validateNonce(order.info.nonce)
    if (!nonceValidation.valid) {
      return nonceValidation
    }

    const swapperValidation = this.validateOfferer(order.info.swapper)
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

    const inputStartAmountValidation = this.validateInputAmount(order.info.input.startAmount)
    if (!inputStartAmountValidation.valid) {
      return inputStartAmountValidation
    }

    const inputEndAmountValidation = this.validateInputAmount(order.info.input.endAmount)
    if (!inputEndAmountValidation.valid) {
      return inputStartAmountValidation
    }

    const outputsValidation = this.validateOutputs(order.info.outputs)
    if (!outputsValidation.valid) {
      return outputsValidation
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

  private validateDeadline(deadline: number): OrderValidationResponse {
    if (deadline < this.getCurrentTime()) {
      return {
        valid: false,
        errorString: 'Deadline must be in the future',
      }
    }
    if (deadline > this.getCurrentTime() + THIRTY_MINUTES_IN_SECONDS) {
      return {
        valid: false,
        errorString: `Deadline field invalid: Order expiry cannot be larger than thirty minutes`,
      }
    }
    return {
      valid: true,
    }
  }

  private validatedecayStartTime(decayStartTime: number, deadline: number): OrderValidationResponse {
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

  private validateOfferer(swapper: string): OrderValidationResponse {
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

  private validateOutputs(dutchOutputs: DutchOutput[]): OrderValidationResponse {
    for (const output of dutchOutputs) {
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
}
