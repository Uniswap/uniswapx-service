import {
  CosignedPriorityOrder as SDKPriorityOrder,
  CosignedPriorityOrderInfoJSON,
  PriorityOrderBuilder,
} from '@uniswap/uniswapx-sdk'
import { BigNumber, constants } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { MOCK_LATEST_BLOCK, Tokens } from '../unit/fixtures'
import { PartialDeep } from './PartialDeep'

/**
 * Helper class for building CosignedPriorityOrders.
 */
export class SDKPriorityOrderFactory {
  static buildPriorityOrder(
    chainId = ChainId.MAINNET,
    overrides: PartialDeep<CosignedPriorityOrderInfoJSON> = {}
  ): SDKPriorityOrder {
    // Values adapted from https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/utils/order.test.ts#L28
    const nowInSeconds = Math.floor(Date.now() / 1000)

    // Arbitrary default future time ten seconds in future
    const futureTime = nowInSeconds + 10

    let builder = new PriorityOrderBuilder(chainId)

    builder = builder
      .cosigner(overrides.cosigner ?? constants.AddressZero)
      .cosignature(overrides.cosignature ?? '0x')
      .deadline(overrides.deadline ?? futureTime)
      .swapper(overrides.swapper ?? '0x0000000000000000000000000000000000000000')
      .nonce(overrides.nonce ? BigNumber.from(overrides.nonce) : BigNumber.from(100))
      .input({
        token: overrides.input?.token ?? Tokens.MAINNET.USDC,
        amount: overrides.input?.amount ? BigNumber.from(overrides.input?.amount) : BigNumber.from('1000000'),
        mpsPerPriorityFeeWei: overrides.input?.mpsPerPriorityFeeWei
          ? BigNumber.from(overrides.input?.mpsPerPriorityFeeWei)
          : BigNumber.from(0),
      })
      .auctionStartBlock(
        overrides.auctionStartBlock
          ? BigNumber.from(overrides.auctionStartBlock)
          : BigNumber.from(MOCK_LATEST_BLOCK + 10)
      )
      .auctionTargetBlock(
        overrides.cosignerData?.auctionTargetBlock
          ? BigNumber.from(overrides.cosignerData?.auctionTargetBlock)
          : BigNumber.from(MOCK_LATEST_BLOCK + 1)
      )
      .baselinePriorityFeeWei(BigNumber.from(0))

    const outputs = overrides.outputs ?? [
      {
        token: Tokens.MAINNET.WETH,
        amount: '1000000000000000000',
        mpsPerPriorityFeeWei: '1',
        recipient: '0x0000000000000000000000000000000000000000',
      },
    ]
    for (const output of outputs) {
      builder = builder.output({
        token: output?.token ?? Tokens.MAINNET.WETH,
        amount: output?.amount ? BigNumber.from(output?.amount) : BigNumber.from('1000000000000000000'),
        mpsPerPriorityFeeWei: output?.mpsPerPriorityFeeWei
          ? BigNumber.from(output?.mpsPerPriorityFeeWei)
          : BigNumber.from('1'),
        recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
    }

    return builder.build()
  }
}
