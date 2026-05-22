import { OrderValidator, RelayOrderValidator, V4OrderValidator } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../util/chain'

export interface OnChainValidatorMapOptions<T> {
  factory: (chainId: ChainId) => T
  isSupported: (chainId: ChainId) => boolean
}

export class OnChainValidatorMap<T extends OrderValidator | RelayOrderValidator | V4OrderValidator> {
  private chainIdToValidators: Map<ChainId, T> = new Map()
  private readonly options?: OnChainValidatorMapOptions<T>

  constructor(initial: Array<[ChainId, T]> = [], options?: OnChainValidatorMapOptions<T>) {
    for (const [chainId, validator] of initial) {
      this.chainIdToValidators.set(chainId, validator)
    }
    this.options = options
  }

  get(chainId: ChainId): T {
    let validator = this.chainIdToValidators.get(chainId)
    if (!validator && this.options && this.options.isSupported(chainId)) {
      validator = this.options.factory(chainId)
      this.chainIdToValidators.set(chainId, validator)
    }
    if (!validator) {
      throw new Error(`No onchain validator for chain ${chainId}`)
    }

    return validator
  }

  has(chainId: ChainId): boolean {
    if (this.chainIdToValidators.has(chainId)) return true
    return !!this.options && this.options.isSupported(chainId)
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
