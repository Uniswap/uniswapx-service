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
    CELO = 42220,
    CELO_ALFAJORES = 44787,
    GNOSIS = 100,
    MOONBEAM = 1284
}

export const SUPPORTED_CHAINS: ChainId[] = [
    ChainId.MAINNET,
    ChainId.GÖRLI
];
