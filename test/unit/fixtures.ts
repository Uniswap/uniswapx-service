import { Context } from 'aws-lambda'
import { Wallet } from 'ethers'
import { ChainId } from '../../lib/util/chain'

export const COSIGNATURE =
  '0xf2e1e1aa8584396c5536afbd10f065b13beedbeea678dd0be884bd110a7b4c4425eb5fe7c28ebd2b97b69fb7ebc582f1ea2340961460b0a4ba2b3e71d94006b41c'

export const QUOTE_ID = '55e2cfca-5521-4a0a-b597-7bfb569032d7'
export const REQUEST_ID = '55e2cfca-5521-4a0a-b597-7bfb569032d8'
export const SIGNATURE =
  '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010'

export const EVENT_CONTEXT = {} as unknown as Context

// 65 zero bytes: passes the post schema's signature shape check, recovers nobody.
export const ZERO_SIGNATURE = `0x${'00'.repeat(65)}`

// Anvil/Hardhat default dev accounts #0-#2: publicly known throwaway keys, so signed orders are
// the same on every run. Never use them outside tests.
export const TestWallets = {
  swapper: new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'),
  cosigner: new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'),
  stranger: new Wallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'),
}

export const Tokens = {
  MAINNET: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // In the SDK's PERMISSIONED_TOKENS list: orders with it as input skip the order quoter.
    BUIDL: '0x7712c34205737192402172409a8F7ccef8aA2AEc',
  },
  ARBITRUM_ONE: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
}

export const MOCK_LATEST_BLOCK = 100
const providerGetLatestBlockMock = jest.fn().mockResolvedValue(MOCK_LATEST_BLOCK)
const providerGetBlockMock = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    number: MOCK_LATEST_BLOCK,
    timestamp: Math.floor(Date.now() / 1000), // Current timestamp at execution time
  })
})
// Every address is an EOA: the swapper signature check ecrecovers instead of calling ERC-1271.
const providerGetCodeMock = jest.fn().mockResolvedValue('0x')

export const MOCK_PROVIDER_MAP = new Map([
  [
    ChainId.MAINNET,
    {
      getBlockNumber: providerGetLatestBlockMock,
      getBlock: providerGetBlockMock,
      getCode: providerGetCodeMock,
    },
  ],
  [
    ChainId.UNICHAIN,
    {
      getBlockNumber: providerGetLatestBlockMock,
      getBlock: providerGetBlockMock,
      getCode: providerGetCodeMock,
    },
  ],
  [
    ChainId.BASE,
    {
      getBlockNumber: providerGetLatestBlockMock,
      getBlock: providerGetBlockMock,
      getCode: providerGetCodeMock,
    },
  ],
  [
    ChainId.POLYGON,
    {
      getBlockNumber: providerGetLatestBlockMock,
      getBlock: providerGetBlockMock,
      getCode: providerGetCodeMock,
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
]) as any
