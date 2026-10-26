import { OrderValidator } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../util/chain'

export class OnChainValidatorMap<T extends OrderValidator> {
  private chainIdToValidators: Map<ChainId, T> = new Map()
  private readonly factory?: (chainId: ChainId) => T

  constructor(initial: Array<[ChainId, T]> = [], factory?: (chainId: ChainId) => T) {
    for (const [chainId, validator] of initial) {
      this.chainIdToValidators.set(chainId, validator)
    }
    this.factory = factory
  }

  get(chainId: ChainId): T {
    let validator = this.chainIdToValidators.get(chainId)
    if (!validator && this.factory) {
      validator = this.factory(chainId)
      this.chainIdToValidators.set(chainId, validator)
    }
    if (!validator) {
      throw new Error(`No onchain validator for chain ${chainId}`)
    }

    return validator
  }
}
