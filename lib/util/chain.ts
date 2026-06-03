import { ChainId } from '@uniswap/sdk-core'

export { ChainId }

// Each chain in SUPPORTED_CHAINS needs an RPC URL resolvable by
// getRpcUrl(chainId) (Config.ts), which reads the `RPC_<chainId>` env var
// (e.g. RPC_1, RPC_130, RPC_8453).
export const SUPPORTED_CHAINS = [
  ChainId.MAINNET,
  ChainId.BASE,
  ChainId.UNICHAIN,
  ChainId.ARBITRUM_ONE,
  ChainId.POLYGON,
  ChainId.SEPOLIA,
]
