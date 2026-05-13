export enum ChainId {
  MAINNET = 1,
  UNICHAIN = 130,
  BASE = 8453,
  OPTIMISM = 10,
  ARBITRUM_ONE = 42161,
  POLYGON = 137,
  SEPOLIA = 11155111,
  UNICHAIN_SEPOLIA = 1301,
  TEMPO = 4217,
  BNB = 56,
  MONAD = 143,
  XLAYER = 196,
  WORLDCHAIN = 480,
  SONEIUM = 1868,
  CELO = 42220,
  AVALANCHE = 43114,
  BLAST = 81457,
  ZORA = 7777777,
}

// Each chain in SUPPORTED_CHAINS needs an RPC URL resolvable by
// getRpcUrl(chainId) (Config.ts) — either RPC_PREFIX_URL covering the
// chain or a per-chain RPC_<chainId> override.
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
