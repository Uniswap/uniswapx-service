import { OrderValidator, RelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../util/chain'

export class OnChainValidatorMap<T extends OrderValidator | RelayOrderValidator> {
  private chainIdToValidators: Map<ChainId, T> = new Map()

  constructor(initial: Array<[ChainId, T]> = []) {
    for (const [chainId, validator] of initial) {
      this.chainIdToValidators.set(chainId, validator)
    }
  }

  get(chainId: ChainId): T {
    const validator = this.chainIdToValidators.get(chainId)
    if (!validator) {
      throw new Error(`No onchain validator for chain ${chainId}`)
    }

    return validator
  }

  set(chainId: ChainId, validator: T): void {
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
