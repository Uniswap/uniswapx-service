import { OrderType, REACTOR_ADDRESS_MAPPING, RelayEventWatcher, UniswapXEventWatcher } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { CONFIG } from '../Config'
import { ChainId, SUPPORTED_CHAINS } from '../util/chain'

export class EventWatcherMap<T extends UniswapXEventWatcher | RelayEventWatcher> {
  private chainIdToEventWatcher: Map<ChainId, T> = new Map()

  constructor(initial: Array<[ChainId, T]> = []) {
    for (const [chainId, eventWatcher] of initial) {
      this.chainIdToEventWatcher.set(chainId, eventWatcher)
    }
  }

  get(chainId: ChainId): T {
    const eventWatcher = this.chainIdToEventWatcher.get(chainId)
    if (!eventWatcher) {
      throw new Error(`No eventWatcher for chain ${chainId}`)
    }

    return eventWatcher
  }

  set(chainId: ChainId, validator: T): void {
    this.chainIdToEventWatcher.set(chainId, validator)
  }

  public static createRelayEventWatcherMap() {
    const map = new EventWatcherMap<RelayEventWatcher>()
    for (const chainId of SUPPORTED_CHAINS) {
      const address = REACTOR_ADDRESS_MAPPING[chainId][OrderType.Relay]
      if (!address) {
        throw new Error(`No Reactor Address Configured for ${chainId}, ${OrderType.Relay}`)
      }
      map.set(
        chainId,
        new RelayEventWatcher(new ethers.providers.StaticJsonRpcProvider(CONFIG.rpcUrls.get(chainId)), address)
      )
    }
    return map
  }
}
