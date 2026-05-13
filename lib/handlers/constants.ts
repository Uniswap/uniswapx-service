import { BigNumber } from 'ethers'
import { ChainId } from '../util/chain'

export const HIGH_MAX_OPEN_ORDERS_SWAPPERS: string[] = [
  // canaries
  '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
  '0xf82af5cd1f0d24cdcf9d35875107d5e43ce9b3d0',
  '0xa50dac48d61bb52b339c7ef0dcefa7688338d00a',
  '0x5b062dc717983be67f7e1b44a6557d7da7d399bd',
  // integ tests
  '0xe001e6f6879c07b9ac24291a490f2795106d348c',
  '0x8943ea25bbfe135450315ab8678f2f79559f4630',
]
export const DEFAULT_MAX_OPEN_ORDERS = 5
export const DEFAULT_MAX_OPEN_LIMIT_ORDERS = 100
export const HIGH_MAX_OPEN_ORDERS = 200

// Chains that register Dutch_V3 only (no priority/hybrid reactor in
// @uniswap/uniswapx-sdk's REACTOR_ADDRESS_MAPPING) get sentinel-0 entries
// here to satisfy Record<ChainId, number> typing.
// OffChainUniswapXOrderValidator.validateReactorAddress rejects
// priority/hybrid orders for those chainIds before these buffers are
// consulted, so the values are unreachable in practice.
export const PRIORITY_ORDER_TARGET_BLOCK_BUFFER: Record<ChainId, number> = {
  [ChainId.MAINNET]: 3,
  [ChainId.UNICHAIN]: 4,
  [ChainId.BASE]: 3,
  [ChainId.OPTIMISM]: 3,
  [ChainId.ARBITRUM_ONE]: 3,
  [ChainId.POLYGON]: 3,
  [ChainId.SEPOLIA]: 3,
  [ChainId.UNICHAIN_SEPOLIA]: 4,
  // V3-rollout chains: priority orders unreachable (see comment above).
  [ChainId.TEMPO]: 0,
  [ChainId.BNB]: 0,
  [ChainId.MONAD]: 0,
  [ChainId.XLAYER]: 0,
  [ChainId.WORLDCHAIN]: 0,
  [ChainId.SONEIUM]: 0,
  [ChainId.CELO]: 0,
  [ChainId.AVALANCHE]: 0,
  [ChainId.BLAST]: 0,
  [ChainId.ZORA]: 0,
}

// Hybrid orders use target block to determine when the price curve starts.
// Same reasoning as PRIORITY_ORDER_TARGET_BLOCK_BUFFER above: V3-rollout chains
// have no hybrid reactor, so the entries below are unreachable sentinel-0s.
export const HYBRID_ORDER_TARGET_BLOCK_BUFFER: Record<ChainId, number> = {
  [ChainId.MAINNET]: 3,
  [ChainId.UNICHAIN]: 4,
  [ChainId.BASE]: 3,
  [ChainId.OPTIMISM]: 3,
  [ChainId.ARBITRUM_ONE]: 3,
  [ChainId.POLYGON]: 3,
  [ChainId.SEPOLIA]: 3,
  [ChainId.UNICHAIN_SEPOLIA]: 4,
  // V3-rollout chains: hybrid orders unreachable (see comment above).
  [ChainId.TEMPO]: 0,
  [ChainId.BNB]: 0,
  [ChainId.MONAD]: 0,
  [ChainId.XLAYER]: 0,
  [ChainId.WORLDCHAIN]: 0,
  [ChainId.SONEIUM]: 0,
  [ChainId.CELO]: 0,
  [ChainId.AVALANCHE]: 0,
  [ChainId.BLAST]: 0,
  [ChainId.ZORA]: 0,
}

export const DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC = 20

export const UR_EXECUTE_SELECTOR = '24856bc3'
export const UR_EXECUTE_WITH_DEADLINE_SELECTOR = '3593564c'
export const UR_EXECUTE_FUNCTION = 'execute'
export const UR_FUNCTION_SIGNATURES: Record<string, string> = {
  [UR_EXECUTE_SELECTOR]: 'function execute(bytes commands, bytes[] inputs)',
  [UR_EXECUTE_WITH_DEADLINE_SELECTOR]: 'function execute(bytes commands, bytes[] inputs, uint256 deadline)',
}
export const UR_EXECUTE_DEADLINE_BUFFER = 60 // Seconds to extend calldata deadline
export const UR_UNWRAP_WETH_PARAMETERS = ['address', 'uint256']
export const UR_SWEEP_PARAMETERS = ['address', 'address', 'uint256']
export const UR_ACTIONS_PARAMETERS = ['bytes', 'bytes[]']
export const UR_TAKE_PARAMETERS = ['address', 'address', 'uint256']

// Constants for hex string manipulation
export const HEX_PREFIX = '0x'
export const HEX_BASE = 16
export const CHARS_PER_BYTE = 2
export const UR_SELECTOR_BYTES = 4
export const UR_BYTES_PER_ACTION = 2

export const BASE_SCALING_FACTOR = BigNumber.from(10).pow(18)
export const SCALING_FACTOR_MASK = BigNumber.from(1).shl(240).sub(1)
