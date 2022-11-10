import { BigNumber } from 'ethers'
import { DutchLimitOrder, DutchOutput } from 'gouda-sdk'
import FieldValidator from '../field-validator'

export type ValidationResponse = {
  valid: boolean;
  errorString?: string;
}

/**
 * Interface for a provider that validates decoded dutch orders
 * @export
 * @interface ValidationProvider
 */
export interface ValidationProvider {
  validate(order: DutchLimitOrder): ValidationResponse
}

export class OffchainValidationProvider implements ValidationProvider {
  private minOffset: number
  private getCurrentTime: () => number

  constructor(getCurrentTime: () => number, minOffset = 1) {
    this.getCurrentTime = getCurrentTime
    this.minOffset = minOffset
  }

  validate(order: DutchLimitOrder): ValidationResponse {
    const deadlineValidation = this.validateDeadline(order.info.deadline)
    if (!deadlineValidation.valid) {
      return deadlineValidation
    }

    const startTimeValidation = this.validateStartTime(order.info.startTime, order.info.deadline)
    if (!startTimeValidation.valid) {
      return startTimeValidation
    }

    const nonceValidation = this.validateNonce(order.info.nonce)
    if (!nonceValidation.valid) {
      return nonceValidation
    }

    const offererValidation = this.validateOfferer(order.info.offerer)
    if (!offererValidation.valid) {
      return offererValidation
    }

    const reactorValidation = this.validateReactor(order.info.reactor)
    if (!reactorValidation.valid) {
      return reactorValidation
    }

    const inputTokenValidation = this.validateInputToken(order.info.input.token)
    if (!inputTokenValidation.valid) {
      return inputTokenValidation
    }

    const inputAmountValidation = this.validateInputAmount(order.info.input.amount)
    if (!inputAmountValidation.valid) {
      return inputAmountValidation
    }

    const outputsValidation = this.validateOutputs(order.info.outputs)
    if (!outputsValidation.valid) {
      return outputsValidation
    }
    return {
      valid: true
    }
  }

  validateDeadline(deadline: number): ValidationResponse {
    if (deadline < this.getCurrentTime() + this.minOffset) {
      return {
        valid: false,
        errorString: `Deadline field invalid: value too small`
      }
    }
    return {
      valid: true
    }
  }

  validateStartTime(startTime: number, deadline: number): ValidationResponse {
    if (startTime > deadline) {
      return {
        valid: false,
        errorString: 'Invalid startTime: startTime > deadline'
      }
    }
    return {
      valid: true
    }
  }

  validateNonce(nonce: BigNumber): ValidationResponse {
    if (nonce.lt(0)) {
      return {
        valid: false,
        errorString: 'Invalid startTime: nonce < 0'
      }
    }
    return {
      valid: true
    }
  }

  validateOfferer(offerer: string): ValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(offerer).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid offerer: ${error}`
      }
    }
    return {
      valid: true
    }
  }

  validateReactor(reactor: string): ValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(reactor).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid reactor: ${error}`
      }
    }
    return {
      valid: true
    }
  }

  validateInputToken(token: string): ValidationResponse {
    const error = FieldValidator.isValidEthAddress().validate(token).error
    if (error) {
      return {
        valid: false,
        errorString: `Invalid input token: ${error}`
      }
    }
    return {
      valid: true
    }
  }

  validateInputAmount(amount: BigNumber): ValidationResponse {
    if (amount.lte(0)) {
      return {
        valid: false,
        errorString: 'Invalid input amount: amount <= 0'
      }
    }
    return {
      valid: true
    }
  }

  validateOutputs(dutchOutputs: DutchOutput[]): ValidationResponse {
    for (const output of dutchOutputs) {
      const { token, recipient, startAmount, endAmount } = output
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          valid: false,
          errorString: `Invalid output token ${token}`
        }
      }

      if (FieldValidator.isValidEthAddress().validate(recipient).error) {
        return {
          valid: false,
          errorString: `Invalid recipient ${recipient}`
        }
      }

      if (startAmount.lt(0)) {
        return {
          valid: false,
          errorString: `Invalid startAmount ${startAmount.toString()}`
        }
      }

      if (endAmount.lt(0)) {
        return {
          valid: false,
          errorString: `Invalid endAmount ${output.endAmount.toString()}`
        }
      }
    }
    return {
      valid: true
    }
  }
}
