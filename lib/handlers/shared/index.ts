import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { ethers } from 'ethers'
import { CONFIG } from '../../Config'
import { ChainId } from '../../util/chain'
import { RPC_HEADERS, RPC_PROVIDER_TIMEOUT_MS } from '../../util/constants'

export interface ProviderMap {
  get(chainId: ChainId): StaticJsonRpcProvider | undefined
}

export class LazyProviderMap implements ProviderMap {
  private readonly providers: Map<ChainId, StaticJsonRpcProvider> = new Map()

  get(chainId: ChainId): StaticJsonRpcProvider {
    let provider = this.providers.get(chainId)
    if (!provider) {
      provider = new ethers.providers.StaticJsonRpcProvider(
        { url: CONFIG.rpcUrls.get(chainId), headers: RPC_HEADERS, timeout: RPC_PROVIDER_TIMEOUT_MS },
        chainId
      )
      this.providers.set(chainId, provider)
    }
    return provider
  }
}
