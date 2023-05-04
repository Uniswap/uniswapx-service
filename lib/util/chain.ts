export enum ChainId {
  MAINNET = 1,
  GÖRLI = 5,
  OPTIMISM = 10,
  ARBITRUM_ONE = 42161,
  POLYGON = 137,
  TENDERLY = 'TENDERLY',
}

export const SUPPORTED_CHAINS = [ChainId.MAINNET, ChainId.GÖRLI, ChainId.TENDERLY, ChainId.POLYGON]
