import { checkDefined } from './preconditions/preconditions'
import { RpcUrlMap } from './RpcUrlMap'
import { SUPPORTED_CHAINS } from './util/chain'

type Config = {
  rpcUrls: RpcUrlMap
}

export const buildConfig = (): Config => {
  const rpcUrls = new RpcUrlMap()
  for (const chainId of SUPPORTED_CHAINS) {
    const url = checkDefined(process.env[`RPC_${chainId}`], `Missing env variable: RPC_${chainId}`)
    rpcUrls.set(chainId, url)
  }

  return {
    rpcUrls,
  }
}

export const CONFIG = buildConfig()
