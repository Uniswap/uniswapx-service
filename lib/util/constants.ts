import { ChainId } from "./chain"

export const WEBHOOK_CONFIG_BUCKET = 'order-webhook-notification-config'
export const PRODUCTION_WEBHOOK_CONFIG_KEY = 'production.json'
export const BETA_WEBHOOK_CONFIG_KEY = 'beta.json'
export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'
export const ONE_HOUR_IN_SECONDS = 60 * 60
export const ONE_DAY_IN_SECONDS = 60 * 60 * 24
export const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365
export const OLDEST_BLOCK_BY_CHAIN = {
  [ChainId.MAINNET]: 20120259,
  // [ChainId.ARBITRUM_ONE]: 253597707,
  // [ChainId.BASE]: 22335646,
  // [ChainId.UNICHAIN]: 6747397,
}
export const BLOCK_TIME_MS_BY_CHAIN = {
  [ChainId.MAINNET]: 12000,
  [ChainId.ARBITRUM_ONE]: 250,
  [ChainId.BASE]: 2000,
  [ChainId.UNICHAIN]: 1000,
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

export const UNIMIND_ALGORITHM_VERSION = 3;
export const DEFAULT_UNIMIND_PARAMETERS = JSON.stringify({
  lambda1: 0,
  lambda2: 5,
  Sigma: -9.968
})
export const UNIMIND_UPDATE_THRESHOLD = 25
export const UNIMIND_DEV_SWAPPER_ADDRESS = '0x2b813964306D8F12bdaB5504073a52e5802f049D'
// Direct pi and tau to use for curve; Not intrinsicValues
export const PUBLIC_UNIMIND_PARAMETERS = {
  pi: 15,
  tau: 15
}
export const UNIMIND_MAX_TAU_BPS = 25

export const RPC_HEADERS = {
  'x-uni-service-id': 'x_order_service'
} as const