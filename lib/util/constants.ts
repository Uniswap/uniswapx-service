import { ChainId } from './chain'
import { BigNumber } from 'ethers'
import { z } from 'zod'

export const WEBHOOK_CONFIG_BUCKET = 'order-webhook-notification-config'
export const PRODUCTION_WEBHOOK_CONFIG_KEY = 'production.json'
export const BETA_WEBHOOK_CONFIG_KEY = 'beta.json'
export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'
export const SCALING_FACTOR_MASK = BigNumber.from(1).shl(240).sub(1)
export const ONE_HOUR_IN_SECONDS = 60 * 60
export const ONE_DAY_IN_SECONDS = 60 * 60 * 24
export const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365
// Per-chain "oldest block worth scanning" used by the GS reaper to floor its
// 1-week lookback window. Values are seeded just below each chain's earliest
// reactor deploy block — the earliest block any UniswapX fill could appear on.
export const OLDEST_BLOCK_BY_CHAIN = {
  [ChainId.MAINNET]: 20120259,
  [ChainId.OPTIMISM]: 151283000,
  [ChainId.BNB]: 96919000,
  [ChainId.UNICHAIN]: 6747397,
  [ChainId.POLYGON]: 86529000,
  [ChainId.MONAD]: 73051000,
  [ChainId.XLAYER]: 59397000,
  [ChainId.WORLDCHAIN]: 29415000,
  [ChainId.SONEIUM]: 22515000,
  [ChainId.TEMPO]: 17850000,
  [ChainId.BASE]: 22335646,
  [ChainId.ARBITRUM_ONE]: 253597707,
  [ChainId.CELO]: 66266000,
  [ChainId.AVALANCHE]: 84833000,
  [ChainId.BLAST]: 34678000,
  [ChainId.ZORA]: 45736000,
}
export const BLOCK_TIME_MS_BY_CHAIN = {
  [ChainId.MAINNET]: 12000,
  [ChainId.OPTIMISM]: 2000,
  [ChainId.BNB]: 3000,
  [ChainId.UNICHAIN]: 1000,
  [ChainId.POLYGON]: 2000,
  [ChainId.MONAD]: 1000,
  [ChainId.XLAYER]: 3000,
  [ChainId.WORLDCHAIN]: 2000,
  [ChainId.SONEIUM]: 2000,
  [ChainId.TEMPO]: 500,
  [ChainId.BASE]: 2000,
  [ChainId.ARBITRUM_ONE]: 250,
  [ChainId.CELO]: 5000,
  [ChainId.AVALANCHE]: 2000,
  [ChainId.BLAST]: 2000,
  [ChainId.ZORA]: 2000,
}
export const BLOCKS_IN_24_HOURS = (chainId: ChainId) => {
  const dayInMs = 24 * 60 * 60 * 1000
  return Math.floor(dayInMs / (BLOCK_TIME_MS_BY_CHAIN[chainId as keyof typeof BLOCK_TIME_MS_BY_CHAIN] ?? 12000))
}
export const BLOCK_RANGE = 10000
export const REAPER_MAX_ATTEMPTS = 10
export const REAPER_RANGES_PER_RUN = 10
//Dynamo limits batch write to 25
export const DYNAMO_BATCH_WRITE_MAX = 25

export const UNIMIND_ALGORITHM_VERSION = 4

export enum UnimindUpdateType {
  NEW_PAIR = 'new_pair',
  ALGORITHM_UPDATE = 'algorithm_update',
  THRESHOLD_REACHED = 'threshold_reached',
}
export const DEFAULT_UNIMIND_PARAMETERS = JSON.stringify({
  lambda1: 0,
  lambda2: 5,
  Sigma: -9.21034,
})
export const UNIMIND_UPDATE_THRESHOLD = 25
export const UNIMIND_CIRCUIT_BREAKER_MAX_BATCH = 5 // Circuit breaker active for batches 0-5
export const UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS = 4 // Order count to begin checking circuit breaker
export const UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD = 0.25 // Fill rate at or below this value triggers circuit breaker
export const UNIMIND_DEV_SWAPPER_ADDRESS = '0x2b813964306D8F12bdaB5504073a52e5802f049D'

// Direct pi and tau to use for curve; Not intrinsicValues
export const PUBLIC_STATIC_PARAMETERS = {
  pi: 15,
  tau: 15,
  batchNumber: -1, // -1 indicates Unimind was not used to calculate these params
  algorithmVersion: -1, // -1 indicates not using Unimind algorithm
}
export const UNIMIND_MAX_TAU_BPS = 25
export const UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD = 1.25 // 1.25% price impact threshold

// Sanity-check unimind constants at module load time so misconfigurations fail fast.
const UnimindConstantsSchema = z.object({
  updateThreshold: z.number().int().positive(),
  circuitBreakerMaxBatch: z.number().int().nonnegative(),
  circuitBreakerMinOrders: z.number().int().positive(),
  circuitBreakerFillRateThreshold: z.number().min(0).max(1),
  maxTauBps: z.number().positive(),
  devSwapperAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
})

UnimindConstantsSchema.parse({
  updateThreshold: UNIMIND_UPDATE_THRESHOLD,
  circuitBreakerMaxBatch: UNIMIND_CIRCUIT_BREAKER_MAX_BATCH,
  circuitBreakerMinOrders: UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS,
  circuitBreakerFillRateThreshold: UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD,
  maxTauBps: UNIMIND_MAX_TAU_BPS,
  devSwapperAddress: UNIMIND_DEV_SWAPPER_ADDRESS,
})

// When pi = 0, AMM will be favored over Dutch Auction
export const USE_CLASSIC_PARAMETERS = {
  pi: 0,
  tau: 0,
  // batchNumber and algorithmVersion are added dynamically
}

export const RPC_HEADERS = {
  'x-uni-service-id': 'x_order_service',
} as const

export enum TradeType {
  EXACT_INPUT = 'EXACT_INPUT',
  EXACT_OUTPUT = 'EXACT_OUTPUT',
}
