import { DutchOrder as SDKDutchOrder, DutchOrderBuilder, DutchOrderInfoJSON } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { Tokens } from '../unit/fixtures'
import { PartialDeep } from './PartialDeep'

/**
 * Helper class for building DutchV1 and Limit orders.
 * All values adpated from https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/utils/order.test.ts#L28
 */
export class SDKDutchOrderFactory {
  static buildDutchOrder(chainId = ChainId.MAINNET, overrides: PartialDeep<DutchOrderInfoJSON> = {}): SDKDutchOrder {
    const builder = this.createBuilder(chainId, overrides)

    const outputs = overrides.outputs ?? [
      {
        token: Tokens.MAINNET.WETH,
        startAmount: '1000000000000000000',
        endAmount: '900000000000000000',
        recipient: '0x0000000000000000000000000000000000000000',
      },
    ]
    for (const output of outputs) {
      builder.output({
        token: output?.token ?? Tokens.MAINNET.WETH,
        startAmount: output?.startAmount ? BigNumber.from(output.startAmount) : BigNumber.from('1000000000000000000'),
        endAmount: output?.endAmount ? BigNumber.from(output.endAmount) : BigNumber.from('900000000000000000'),
        recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
    }

    return builder.build()
  }

  static buildLimitOrder(chainId = ChainId.MAINNET, overrides: PartialDeep<DutchOrderInfoJSON> = {}) {
    const builder = this.createBuilder(chainId, overrides)
    const outputs = overrides.outputs ?? [
      {
        token: Tokens.MAINNET.USDC,
        startAmount: '1000000000000000000',
        endAmount: '1000000000000000000',
        recipient: '0x0000000000000000000000000000000000000000',
      },
    ]
    for (const output of outputs) {
      if (output?.startAmount && output?.endAmount && output?.startAmount !== output?.endAmount) {
        throw new Error('Limit order with output overrides must have matching startAmount + endAmount')
      }
      builder.output({
        token: output?.token ?? Tokens.MAINNET.WETH,
        // start + end amount must be the same for an input order
        startAmount: output?.startAmount ? BigNumber.from(output?.startAmount) : BigNumber.from('1000000000000000000'),
        endAmount: output?.endAmount ? BigNumber.from(output?.endAmount) : BigNumber.from('1000000000000000000'),
        recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
      })
    }

    return builder.build()
  }

  static createBuilder(chainId: number, overrides: PartialDeep<DutchOrderInfoJSON>) {
    // Values adapted from https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/utils/order.test.ts#L28
    const nowInSeconds = Math.floor(Date.now() / 1000)

    // Arbitrary default future time ten seconds in future
    const futureTime = nowInSeconds + 10

    let builder = new DutchOrderBuilder(chainId)

    builder = builder
      .deadline(overrides.deadline ?? futureTime)
      .decayEndTime(overrides.decayEndTime ?? futureTime)
      .decayStartTime(overrides.decayStartTime ?? nowInSeconds)
      .swapper(overrides.swapper ?? '0x0000000000000000000000000000000000000001')
      .nonce(overrides.nonce ? BigNumber.from(overrides.nonce) : BigNumber.from(100))
      .input({
        token: overrides.input?.token ?? Tokens.MAINNET.USDC,
        startAmount: overrides.input?.startAmount
          ? BigNumber.from(overrides.input?.startAmount)
          : BigNumber.from('1000000'),
        endAmount: overrides.input?.endAmount ? BigNumber.from(overrides.input?.endAmount) : BigNumber.from('1000000'),
      })

    return builder
  }
}
