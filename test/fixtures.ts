import { DutchOrderInfo, OrderType, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'

export const ORDER_INFO: DutchOrderInfo = {
  deadline: 10,
  swapper: '0x0000000000000000000000000000000000000001',
  reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch].toLowerCase(),
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
