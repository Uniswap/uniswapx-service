import { ChainId } from './util/chain'

export class RpcUrlMap {
  private chainIdToUrl: Map<ChainId, string> = new Map()

  get(chainId: ChainId): string {
    const url = this.chainIdToUrl.get(chainId)
    if (!url) {
      throw new Error(`No RPC url defined for chain ${chainId}`)
    }

    return url
  }

  set(chainId: ChainId, url: string): void {
    this.chainIdToUrl.set(chainId, url)
  }
}
