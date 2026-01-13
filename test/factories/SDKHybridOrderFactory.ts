import {
  CosignedHybridOrder as SDKHybridOrder,
  CosignedHybridOrderInfoJSON,
  HybridOrderBuilder,
  HYBRID_RESOLVER_ADDRESS_MAPPING,
} from '@uniswap/uniswapx-sdk'
import { BigNumber, constants, ethers } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { COSIGNATURE, MOCK_LATEST_BLOCK, Tokens } from '../unit/fixtures'
import { PartialDeep } from './PartialDeep'

/**
 * Helper class for building CosignedHybridOrders.
 * All values adapted from https://github.com/Uniswap/sdks/blob/c4177e520e17cc291608589c4c07212b061bab8c/sdks/uniswapx-sdk/src/builder/HybridOrderBuilder.test.ts
 */
export class SDKHybridOrderFactory {
  static buildHybridOrder(
    chainId = ChainId.MAINNET,
    overrides: PartialDeep<CosignedHybridOrderInfoJSON> = {}
  ): SDKHybridOrder {
    const nowInSeconds = Math.floor(Date.now() / 1000)

    // Arbitrary default future time ten seconds in future
    const futureTime = nowInSeconds + 10

    // Use the HYBRID_RESOLVER_ADDRESS_MAPPING or a placeholder if not defined
    const resolver = HYBRID_RESOLVER_ADDRESS_MAPPING[chainId] ?? constants.AddressZero

    let builder = new HybridOrderBuilder(chainId, '0x0000000000000000000000000000000000000001', resolver)

    builder = builder
      .cosigner(overrides.cosigner ?? constants.AddressZero)
      .cosignature(overrides.cosignature ?? COSIGNATURE)
      .deadline(overrides.deadline ?? futureTime)
      .swapper(overrides.swapper ?? '0x0000000000000000000000000000000000000000')
      .nonce(overrides.nonce ? BigNumber.from(overrides.nonce) : BigNumber.from(100))
      .input({
        token: overrides.input?.token ?? Tokens.MAINNET.USDC,
        maxAmount: overrides.input?.maxAmount ? BigNumber.from(overrides.input?.maxAmount) : BigNumber.from('1000000'),
      })
      .auctionStartBlock(
        overrides.auctionStartBlock
          ? BigNumber.from(overrides.auctionStartBlock)
          : BigNumber.from(MOCK_LATEST_BLOCK + 10)
      )
      .baselinePriorityFee(
        overrides.baselinePriorityFee ? BigNumber.from(overrides.baselinePriorityFee) : BigNumber.from(0)
      )
      .scalingFactor(
        overrides.scalingFactor ? BigNumber.from(overrides.scalingFactor) : ethers.constants.WeiPerEther // 1e18 - neutral scaling factor
      )
      .priceCurve(
        overrides.priceCurve ? overrides.priceCurve.map((p) => BigNumber.from(p)) : [] // Empty price curve by default (priority-only mode)
      )
      .auctionTargetBlock(
        overrides.cosignerData?.auctionTargetBlock
          ? BigNumber.from(overrides.cosignerData?.auctionTargetBlock)
          : BigNumber.from(MOCK_LATEST_BLOCK + 1)
      )
      .supplementalPriceCurve(
        overrides.cosignerData?.supplementalPriceCurve
          ? overrides.cosignerData.supplementalPriceCurve.map((p) => BigNumber.from(p))
          : []
      )

    const outputs = overrides.outputs ?? [
      {
        token: Tokens.MAINNET.WETH,
        minAmount: '1000000000000000000',
        recipient: '0x0000000000000000000000000000000000000000',
      },
    ]
    for (const output of outputs) {
      builder = builder.output({
        token: output?.token ?? Tokens.MAINNET.WETH,
        minAmount: output?.minAmount ? BigNumber.from(output?.minAmount) : BigNumber.from('1000000000000000000'),
        recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
    }

    return builder.build()
  }
}
