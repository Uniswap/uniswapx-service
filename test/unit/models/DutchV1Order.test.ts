import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import { DutchV1Order } from '../../../lib/models/DutchV1Order'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { QUOTE_ID, SIGNATURE } from '../fixtures'

describe('DutchV1Order', () => {
  it('builds an order from the SDK DutchOrder', () => {
    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET)

    const order = DutchV1Order.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)

    expect(order.chainId).toEqual(ChainId.MAINNET)
    expect(order.orderType).toEqual(OrderType.Dutch)
    expect(order.signature).toEqual(SIGNATURE)
    expect(order.inner).toEqual(sdkOrder)
    expect(order.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(order.quoteId).toEqual(QUOTE_ID)
  })
})
