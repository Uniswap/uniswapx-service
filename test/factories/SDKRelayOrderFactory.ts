import { RelayOrder as SDKRelayOrder, RelayOrderBuilder, RelayOrderInfoJSON } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { Tokens } from '../unit/fixtures'
import { PartialDeep } from './PartialDeep'

/**
 * Helper class for building RelayOrders.
 * All values adpated from  https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/builder/RelayOrderBuilder.test.ts#L30
 */
export class SDKRelayOrderFactory {
  static buildRelayOrder(chainId = ChainId.MAINNET, overrides: PartialDeep<RelayOrderInfoJSON> = {}): SDKRelayOrder {
    // Values adapted from https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/utils/order.test.ts#L28
    const nowInSeconds = Math.floor(Date.now() / 1000)

    // Arbitrary default future time ten seconds in future
    const futureTime = nowInSeconds + 10

    let builder = new RelayOrderBuilder(chainId)

    builder = builder
      .deadline(overrides.deadline ?? futureTime)
      .swapper(overrides.swapper ?? '0x0000000000000000000000000000000000000001')
      .nonce(overrides.nonce ? BigNumber.from(overrides.nonce) : BigNumber.from(100))
      .universalRouterCalldata(overrides.universalRouterCalldata ?? '0x')
      .input({
        token: overrides.input?.token ?? Tokens.MAINNET.WETH,
        amount: overrides.input?.amount ? BigNumber.from(overrides.input?.amount) : BigNumber.from('1000000'),
        recipient: overrides.input?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
      .fee({
        token: overrides.fee?.token ?? Tokens.MAINNET.WETH,
        startAmount: overrides.fee?.startAmount
          ? BigNumber.from(overrides.fee?.startAmount)
          : BigNumber.from('1000000'),
        endAmount: overrides.fee?.endAmount ? BigNumber.from(overrides.fee?.endAmount) : BigNumber.from('1000000'),
        startTime: overrides.fee?.startTime ?? nowInSeconds,
        endTime: overrides.fee?.endTime ?? futureTime,
      })
    return builder.build()
  }
}
