import {
  CosignedV3DutchOrder as SDKDutchOrderV3,
  encodeExclusiveFillerData,
  V3DutchOrderBuilder,
  CosignedV3DutchOrderInfo,
} from '@uniswap/uniswapx-sdk'
import { BigNumber, constants } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { MOCK_LATEST_BLOCK, Tokens } from '../unit/fixtures'
import { PartialDeep } from './PartialDeep'

/**
 * Helper class for building CosignedV3DutchOrders.
 * All values adpated from  https://github.com/Uniswap/sdks/blob/eac0738b915bf8490f70b3afa6e9e4b58266b14b/sdks/uniswapx-sdk/src/builder/V3DutchOrderBuilder.test.ts#L22
 */
export class SDKDutchOrderV3Factory {
  static buildDutchV3Order(
    chainId = ChainId.ARBITRUM_ONE,
    overrides: PartialDeep<CosignedV3DutchOrderInfo> = {}
  ): SDKDutchOrderV3 {
    const nowInSeconds = Math.floor(Date.now() / 1000)

    // Arbitrary default future time ten seconds in future
    const futureTime = nowInSeconds + 10

    let builder = new V3DutchOrderBuilder(chainId)
    const startAmount = overrides.input?.startAmount
      ? BigNumber.from(overrides.input?.startAmount)
      : BigNumber.from('1000000')

    builder = builder
      .cosigner(overrides.cosigner ?? constants.AddressZero)
      .cosignature(overrides.cosignature ?? '0x')
      .deadline(overrides.deadline ?? futureTime)
      .decayStartBlock(overrides.cosignerData?.decayStartBlock ?? MOCK_LATEST_BLOCK + 10)
      .startingBaseFee(
        overrides.startingBaseFee ? BigNumber.from(overrides.startingBaseFee) : BigNumber.from(0)
      )
      .swapper(overrides.swapper ?? '0x0000000000000000000000000000000000000000')
      .nonce(overrides.nonce ? BigNumber.from(overrides.nonce) : BigNumber.from(100))
      .input({
        token: overrides.input?.token ?? Tokens.ARBITRUM_ONE.USDC,
        startAmount: startAmount,
        curve: {
          relativeBlocks: overrides.input?.curve?.relativeBlocks?.map(x => x ?? 0) || [],
          relativeAmounts: overrides.input?.curve?.relativeAmounts?.map(x => x ?? BigInt(0)) || [],
        },
        maxAmount: overrides.input?.maxAmount
          ? BigNumber.from(overrides.input?.maxAmount)
          : startAmount.add(1),
        adjustmentPerGweiBaseFee: overrides.input?.adjustmentPerGweiBaseFee
          ? BigNumber.from(overrides.input?.adjustmentPerGweiBaseFee)
          : BigNumber.from(0),
      })
      .inputOverride(
        overrides.cosignerData?.inputOverride
          ? BigNumber.from(overrides.cosignerData?.inputOverride)
          : BigNumber.from('0')
      )

    const outputs = overrides.outputs ?? [{}]
    for (const output of outputs) {
      builder = builder.output({
        token: output?.token ?? Tokens.ARBITRUM_ONE.WETH,
        startAmount: output?.startAmount ? BigNumber.from(output?.startAmount) : BigNumber.from('1000000000000000000'),
        curve: {
          relativeBlocks: output?.curve?.relativeBlocks?.map(x => x ?? 0) || [],
          relativeAmounts: output?.curve?.relativeAmounts?.map(x => x ?? BigInt(0)) || [],
        },
        minAmount: output?.minAmount ? BigNumber.from(output?.minAmount) : startAmount,
        adjustmentPerGweiBaseFee: output?.adjustmentPerGweiBaseFee
          ? BigNumber.from(output?.adjustmentPerGweiBaseFee)
          : BigNumber.from(0),
        recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
    }

    const outputOverrides = overrides.cosignerData?.outputOverrides
      ? overrides.cosignerData?.outputOverrides.map((num) => BigNumber.from(num))
      : [BigNumber.from('0')]

    const validationInfo = encodeExclusiveFillerData(
      overrides.cosignerData?.exclusiveFiller ?? '0x1111111111111111111111111111111111111111',
      overrides.deadline ?? futureTime,
      chainId,
      overrides.additionalValidationContract ?? '0x2222222222222222222222222222222222222222'
    )
    builder = builder.outputOverrides(outputOverrides).validation(validationInfo)

    return builder.build()
  }
}
