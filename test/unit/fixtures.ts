import { DutchOrderInfo, OrderType, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { Context } from 'aws-lambda'
import { BigNumber } from 'ethers'

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
export const SIGNATURE =
  '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010'

export const EVENT_CONTEXT = {} as unknown as Context

export const Tokens = {
  MAINNET: {
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
}
