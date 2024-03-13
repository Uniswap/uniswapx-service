import { DutchOrder as SDKDutchOrder, DutchOrderBuilder, DutchOrderInfoJSON } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ChainId } from '../../lib/util/chain'

export const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

/**
 * Helper class for building DutchV1 and Limit orders.
 * All values adpated from https://github.com/Uniswap/uniswapx-sdk/blob/7949043e7d2434553f84f588e1405e87d249a5aa/src/utils/order.test.ts#L28
 */
export class SDKDutchOrderFactory {
  static buildDutchOrder(chainId = ChainId.MAINNET, overrides: Partial<DutchOrderInfoJSON> = {}): SDKDutchOrder {
    const builder = this.createBuilder(chainId, overrides)
    const output = overrides.outputs ? overrides.outputs[0] : undefined

    builder.output({
      token: output?.token ?? WETH_MAINNET,
      startAmount: output?.startAmount ? BigNumber.from(output?.startAmount) : BigNumber.from('1000000000000000000'),
      endAmount: output?.endAmount ? BigNumber.from(output?.endAmount) : BigNumber.from('900000000000000000'),
      recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
    })
    return builder.build()
  }

  static buildLimitOrder(chainId = ChainId.MAINNET, overrides: Partial<DutchOrderInfoJSON> = {}) {
    const builder = this.createBuilder(chainId, overrides)
    const output = overrides.outputs ? overrides.outputs[0] : undefined

    if (output?.startAmount && output?.endAmount && output?.startAmount !== output?.endAmount) {
      throw new Error('Limit order with output overrides must have matching startAmount + endAmount')
    }

    builder.output({
      token: output?.token ?? WETH_MAINNET,
      // start + end amount must be the same for an input order
      startAmount: output?.startAmount ? BigNumber.from(output?.startAmount) : BigNumber.from('1000000000000000000'),
      endAmount: output?.endAmount ? BigNumber.from(output?.endAmount) : BigNumber.from('1000000000000000000'),
      recipient: output?.recipient ?? '0x0000000000000000000000000000000000000000',
    })
    return builder.build()
  }

  static createBuilder(chainId: number, overrides: Partial<DutchOrderInfoJSON>) {
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
        token: overrides.input?.token ?? USDC_MAINNET,
        startAmount: overrides.input?.startAmount
          ? BigNumber.from(overrides.input?.startAmount)
          : BigNumber.from('1000000'),
        endAmount: overrides.input?.endAmount ? BigNumber.from(overrides.input?.endAmount) : BigNumber.from('1000000'),
      })

    // Single support for outputs right now - can enhance this in the future.
    if (overrides.outputs && overrides.outputs.length > 1) {
      throw new Error(
        "SDKDutchOrderFactory currently only supports one output override. Enhance the 'buildDutchOrder' to support multiple."
      )
    }

    return builder
  }
}
