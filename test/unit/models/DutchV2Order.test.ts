import { OrderType } from '@uniswap/uniswapx-sdk'
import { DutchV2Order } from '../../../lib/models/DutchV2Order'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SIGNATURE } from '../fixtures'

describe('DutchV2Order', () => {
  it('builds an order from the SDK CosignedV2DutchOrder', () => {
    const sdkOrder = SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET)

    const order = DutchV2Order.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder)

    expect(order.chainId).toEqual(ChainId.MAINNET)
    expect(order.orderType).toEqual(OrderType.Dutch_V2)
    expect(order.signature).toEqual(SIGNATURE)
    expect(order.inner).toEqual(sdkOrder)
  })
})
