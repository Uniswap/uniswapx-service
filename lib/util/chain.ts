import { ChainId } from '@uniswap/sdk-core'

export { ChainId }

// Each chain in SUPPORTED_CHAINS needs an RPC URL resolvable by
// getRpcUrl(chainId) (Config.ts), which reads the `RPC_<chainId>` env var
// (e.g. RPC_1, RPC_130, RPC_8453).
export const SUPPORTED_CHAINS = [
  ChainId.MAINNET,
  ChainId.OPTIMISM,
  ChainId.BNB,
  ChainId.UNICHAIN,
  ChainId.POLYGON,
  ChainId.MONAD,
  ChainId.XLAYER,
  ChainId.WORLDCHAIN,
  ChainId.SEPOLIA,
  ChainId.UNICHAIN_SEPOLIA,
  ChainId.SONEIUM,
  ChainId.TEMPO,
  ChainId.BASE,
  ChainId.ARBITRUM_ONE,
  ChainId.CELO,
  ChainId.AVALANCHE,
  ChainId.BLAST,
  ChainId.ZORA,
]
