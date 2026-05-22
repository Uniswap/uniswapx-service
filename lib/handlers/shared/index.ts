import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { ChainId, SUPPORTED_CHAINS } from '../../util/chain'
import { RPC_HEADERS } from '../../util/constants'

export interface ProviderMap {
  get(chainId: ChainId): StaticJsonRpcProvider | undefined
}

export class LazyProviderMap implements ProviderMap {
  private readonly providers: Map<ChainId, StaticJsonRpcProvider> = new Map()
  private readonly supported: Set<ChainId>

  constructor(supported: readonly ChainId[] = SUPPORTED_CHAINS) {
    this.supported = new Set(supported)
  }

  get(chainId: ChainId): StaticJsonRpcProvider | undefined {
    if (!this.supported.has(chainId)) return undefined
    let provider = this.providers.get(chainId)
    if (!provider) {
      provider = new ethers.providers.StaticJsonRpcProvider(
        { url: CONFIG.rpcUrls.get(chainId), headers: RPC_HEADERS },
        chainId
      )
      this.providers.set(chainId, provider)
    }
    return provider
  }
}
