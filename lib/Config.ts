import { RpcUrlMap } from './RpcUrlMap'
import { SUPPORTED_CHAINS } from './util/chain'

type Config = {
  rpcUrls: RpcUrlMap
}

/**
 * Resolve the RPC URL for a given chainId. Per-chain `RPC_<chainId>` env
 * vars take precedence over the shared `RPC_PREFIX_URL` so individual chains
 * can be pointed at a different provider when needed; otherwise the chainId
 * is appended to `RPC_PREFIX_URL` to form the full URL. Throws if neither is
 * set.
 */
export const getRpcUrl = (chainId: number): string => {
  const override = process.env[`RPC_${chainId}`]
  if (override) return override

  const prefix = process.env.RPC_PREFIX_URL
  if (!prefix) {
    throw new Error(`No RPC for chain ${chainId}: set RPC_${chainId} or RPC_PREFIX_URL`)
  }
  return `${prefix.replace(/\/$/, '')}/${chainId}`
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
