export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GÖRLI = 5,
  KOVAN = 42,
  OPTIMISM = 10,
  OPTIMISTIC_KOVAN = 69,
  ARBITRUM_ONE = 42161,
  ARBITRUM_RINKEBY = 421611,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
}

export enum ChainName {
  // ChainNames match infura network strings
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
  RINKEBY = 'rinkeby',
  GÖRLI = 'goerli',
  KOVAN = 'kovan',
  OPTIMISM = 'optimism-mainnet',
  OPTIMISTIC_KOVAN = 'optimism-kovan',
  ARBITRUM_ONE = 'arbitrum-mainnet',
  ARBITRUM_RINKEBY = 'arbitrum-rinkeby',
  POLYGON = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
}

export const ID_TO_NETWORK_NAME = (id: number): ChainName => {
  switch (id) {
    case 1:
      return ChainName.MAINNET;
    case 3:
      return ChainName.ROPSTEN;
    case 4:
      return ChainName.RINKEBY;
    case 5:
      return ChainName.GÖRLI;
    case 42:
      return ChainName.KOVAN;
    case 10:
      return ChainName.OPTIMISM;
    case 69:
      return ChainName.OPTIMISTIC_KOVAN;
    case 42161:
      return ChainName.ARBITRUM_ONE;
    case 421611:
      return ChainName.ARBITRUM_RINKEBY;
    case 137:
      return ChainName.POLYGON;
    case 80001:
      return ChainName.POLYGON_MUMBAI;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};
