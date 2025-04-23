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

export const PRIORITY_ORDER_TARGET_BLOCK_BUFFER: Record<ChainId, number> = {
  [ChainId.MAINNET]: 3,
  [ChainId.UNICHAIN]: 5,
  [ChainId.BASE]: 3,
  [ChainId.OPTIMISM]: 3,
  [ChainId.ARBITRUM_ONE]: 3,
  [ChainId.POLYGON]: 3,
  [ChainId.SEPOLIA]: 3,
  [ChainId.GÖRLI]: 3,
}

export const DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC = 20;

export const UR_EXECUTE_SELECTOR = "24856bc3"
export const UR_EXECUTE_WITH_DEADLINE_SELECTOR = "3593564c"
export const UR_EXECUTE_FUNCTION = "execute"
export const UR_FUNCTION_SIGNATURES: Record<string, string> = {
  [UR_EXECUTE_SELECTOR]: "function execute(bytes commands, bytes[] inputs)",
  [UR_EXECUTE_WITH_DEADLINE_SELECTOR]: "function execute(bytes commands, bytes[] inputs, uint256 deadline)"
};
export const UR_EXECUTE_DEADLINE_BUFFER = 60; // Seconds to extend calldata deadline
export const UR_UNWRAP_WETH_PARAMETERS = ['address', 'uint256']
export const UR_SWEEP_PARAMETERS = ['address', 'address', 'uint256']