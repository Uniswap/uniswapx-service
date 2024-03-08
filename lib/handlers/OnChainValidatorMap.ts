import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../util/chain'

export class OnChainValidatorMap {
  private chainIdToValidators: Map<ChainId, OrderValidator> = new Map()

  constructor(initial: Array<[ChainId, OrderValidator]> = []) {
    for (const [chainId, validator] of initial) {
      this.chainIdToValidators.set(chainId, validator)
    }
  }

  get(chainId: ChainId): OrderValidator {
    const validator = this.chainIdToValidators.get(chainId)
    if (!validator) {
      throw new Error(`No onchain validator for chain ${chainId}`)
    }

    return validator
  }

  set(chainId: ChainId, validator: OrderValidator): void {
    this.chainIdToValidators.set(chainId, validator)
  }

  debug(): {
    [chainId: number]: string
  } {
    const result: Record<number, string> = {}

    for (const [chainId, validator] of this.chainIdToValidators.entries()) {
      result[chainId] = validator.orderQuoterAddress
    }
    return result
  }
}
