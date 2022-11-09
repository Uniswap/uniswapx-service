import FieldValidator from '../field-validator'
import { ErrorResponse } from '../../handlers/base/handler'
import { DutchLimitOrder, DutchOutput } from 'gouda-sdk'
import { BigNumber } from 'ethers'

/**
 * Interface for a provider that validates decoded dutch orders 
 * and returns ErrorResponse object if they are invalid
 * @export
 * @interface iOffchainValidationProvider
 */
export interface iOffchainValidationProvider {
    validate(order: DutchLimitOrder): ErrorResponse|undefined
}

export class OffchainValidationProvider implements iOffchainValidationProvider {
    private minOffset: number

    constructor(minOffset = 1) {
        this.minOffset = minOffset
    }

    validate(order: DutchLimitOrder): ErrorResponse|undefined {
        const deadlineError = this.validateDeadline(order.info.deadline)
        if(deadlineError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: deadlineError
            }
        }

        const startTimeError = this.validateStartTime(order.info.startTime, order.info.deadline)
        if(startTimeError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: startTimeError
            }
        }

        const nonceError = this.validateNonce(order.info.nonce)
        if(nonceError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: nonceError
            }
        }

        const offererError = this.validateOfferer(order.info.offerer)
        if(offererError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: offererError
            }
        }

        const reactorError = this.validateReactor(order.info.reactor)
        if(reactorError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: reactorError
            }
        }

        const inputTokenError = this.validateInputToken(order.info.input.token)
        if(inputTokenError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: inputTokenError
            }
        }

        const inputAmountError = this.validateInputAmount(order.info.input.amount)
        if(inputAmountError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: inputAmountError
            }
        }

        const outputsError = this.validateOutputs(order.info.outputs)
        if(outputsError) {
            return {
                statusCode: 400,
                errorCode: 'order failed validation',
                detail: outputsError
            }
        }
        return undefined
    }

    validateDeadline(deadline: number): string|undefined {
        if(deadline < this.currentTime()+this.minOffset) {
            return `Deadline field invalid: value too small`
        }
        return undefined
    }

    validateStartTime(startTime: number, deadline: number): string|undefined {
        if (startTime > deadline) {
            return 'Invalid startTime: startTime > deadline'
        }
        return undefined
    }

    validateNonce(nonce: BigNumber): string|undefined {
        if(nonce.lt(0)) {
            return 'Invalid startTime: nonce < 0'
        }
        return undefined
    }

    validateOfferer(offerer: string): string|undefined {
        const error = FieldValidator.isValidEthAddress().validate(offerer).error
        if(error) {
            return `Invalid offerer: ${error}`
        }
        return undefined
    }

    validateReactor(reactor: string): string|undefined {
        const error = FieldValidator.isValidEthAddress().validate(reactor).error
        if(error) {
            return `Invalid reactor: ${error}`
        }
        return undefined
    }

    validateInputToken(token: string): string|undefined {
        const error = FieldValidator.isValidEthAddress().validate(token).error
        if(error) {
            return `Invalid input token: ${error}`
        }
        return undefined
    }

    validateInputAmount(amount: BigNumber): string|undefined {
        if(amount.lte(0)) {
            return 'Invalid input amount: amount <= 0'
        }
        return undefined
    }

    validateOutputs(dutchOutputs: DutchOutput[]): string|undefined {
        for (const output of dutchOutputs) {
            const { token, recipient, startAmount, endAmount } = output
            if (FieldValidator.isValidEthAddress().validate(token).error) {
                return `Invalid output token ${token}`
            }
      
            if (FieldValidator.isValidEthAddress().validate(recipient).error) {
                return `Invalid recipient ${recipient}`
            }
      
            if (startAmount.lt(0)) {
                return `Invalid startAmount ${startAmount.toString()}`
            }
      
            if (endAmount.lt(0)) {
                return `Invalid endAmount ${output.endAmount.toString()}`
            }
        }
        return undefined
    }
    private currentTime() {
        return (new Date().getTime())/1000
    }
}