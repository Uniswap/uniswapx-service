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

// OffChainUniswapXOrderValidator.validateReactorAddress rejects
// priority orders for chains not listed here before these buffers
// are consulted, so callers can safely treat a missing entry as unreachable.
export const PRIORITY_ORDER_TARGET_BLOCK_BUFFER: Partial<Record<ChainId, number>> = {
  [ChainId.MAINNET]: 3,
  [ChainId.UNICHAIN]: 4,
  [ChainId.BASE]: 3,
  [ChainId.OPTIMISM]: 3,
  [ChainId.ARBITRUM_ONE]: 3,
  [ChainId.POLYGON]: 3,
  [ChainId.SEPOLIA]: 3,
  [ChainId.UNICHAIN_SEPOLIA]: 4,
}

export const DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC = 20
