import { RpcUrlMap } from './RpcUrlMap'
import { SUPPORTED_CHAINS } from './util/chain'

type Config = {
  rpcUrls: RpcUrlMap
}

/**
 * Resolve the RPC URL for a given chainId from the per-chain env var
 * `RPC_<chainId>` (e.g. RPC_1, RPC_130, RPC_8453). Throws if it is unset.
 */
export const getRpcUrl = (chainId: number): string => {
  const envVar = `RPC_${chainId}`
  const url = process.env[envVar]
  if (!url) {
    throw new Error(`No RPC for chain ${chainId}: set ${envVar}`)
  }
  return url
}

/**
 * Lazy proxy so importing `CONFIG` doesn't require env to be configured at
 * module load — only individual `.get(chainId)` calls throw if the chain's
 * RPC URL can't be resolved.
 */
const lazyRpcUrls: RpcUrlMap = {
  get: (chainId: number): string => getRpcUrl(chainId),
  set: () => {
    /* immutable; URLs are resolved on demand */
  },
} as unknown as RpcUrlMap

export const CONFIG: Config = {
  rpcUrls: lazyRpcUrls,
}

/**
 * Eagerly resolve every chain's RPC URL. Useful for fail-fast startup so
 * missing config surfaces during deploy rather than on first user request.
 */
export const buildConfig = (): Config => {
  const rpcUrls = new RpcUrlMap()
  for (const chainId of SUPPORTED_CHAINS) {
    rpcUrls.set(chainId, getRpcUrl(chainId))
  }
  return { rpcUrls }
}

// In Lambda, validate all chain RPCs at cold-start so a misconfigured deploy
// fails before serving traffic. Gated on the Lambda runtime env var so tests
// and local imports stay lazy.
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  buildConfig()
}
