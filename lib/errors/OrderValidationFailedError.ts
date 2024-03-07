import { ValidationError } from './ValidationError'

export class OrderValidationFailedError extends ValidationError {
  constructor(message = '') {
    super(message)
  }
}
