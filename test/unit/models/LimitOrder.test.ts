import { OrderType } from '@uniswap/uniswapx-sdk'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { QUOTE_ID, SIGNATURE } from '../fixtures'

describe('LimitOrder', () => {
  it('builds an order from the SDK DutchOrder', () => {
    const sdkOrder = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET)

    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, QUOTE_ID)

    expect(order.chainId).toEqual(ChainId.MAINNET)
    expect(order.orderType).toEqual(OrderType.Limit)
    expect(order.signature).toEqual(SIGNATURE)
    expect(order.inner).toEqual(sdkOrder)
  })
})
