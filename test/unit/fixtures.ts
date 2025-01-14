import { DutchOrderInfo, OrderType, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { Context } from 'aws-lambda'
import { BigNumber } from 'ethers'
import { ChainId } from '../../lib/util/chain'

export const COSIGNATURE =
  '0xf2e1e1aa8584396c5536afbd10f065b13beedbeea678dd0be884bd110a7b4c4425eb5fe7c28ebd2b97b69fb7ebc582f1ea2340961460b0a4ba2b3e71d94006b41c'

export const ORDER_INFO: DutchOrderInfo = {
  deadline: 10,
  swapper: '0x0000000000000000000000000000000000000001',
  reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch]!.toLowerCase(),
  decayStartTime: 20,
  decayEndTime: 25,
  input: {
    token: '0x0000000000000000000000000000000000000003',
    endAmount: BigNumber.from(30),
    startAmount: BigNumber.from(30),
  },
  nonce: BigNumber.from('40'),
  outputs: [
    {
      endAmount: BigNumber.from(50),
      startAmount: BigNumber.from(60),
      recipient: '0x0000000000000000000000000000000000000004',
      token: '0x0000000000000000000000000000000000000005',
    },
  ],
  exclusiveFiller: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  exclusivityOverrideBps: BigNumber.from(5),
  additionalValidationContract: '0x0000000000000000000000000000000000000000',
  additionalValidationData: '0x',
}

export const QUOTE_ID = '55e2cfca-5521-4a0a-b597-7bfb569032d7'
export const REQUEST_ID = '55e2cfca-5521-4a0a-b597-7bfb569032d8'
export const SIGNATURE =
  '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010'

export const EVENT_CONTEXT = {} as unknown as Context

export const Tokens = {
  MAINNET: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  ARBITRUM_ONE: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
}

export const MOCK_LATEST_BLOCK = 100
const providerGetLatestBlockMock = jest.fn().mockResolvedValue(MOCK_LATEST_BLOCK)

export const MOCK_PROVIDER_MAP = new Map([
  [
    ChainId.MAINNET,
    {
      getBlockNumber: providerGetLatestBlockMock,
    },
  ],
  [
    ChainId.UNICHAIN,
    {
      getBlockNumber: providerGetLatestBlockMock,
    },
  ],
  [
    ChainId.BASE,
    {
      getBlockNumber: providerGetLatestBlockMock,
    },
  ],
  [
    ChainId.POLYGON,
    {
      getBlockNumber: providerGetLatestBlockMock,
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
]) as any
