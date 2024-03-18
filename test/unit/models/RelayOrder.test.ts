import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import { RelayOrder } from '../../../lib/models/RelayOrder'
import { ChainId } from '../../../lib/util/chain'
import { SDKRelayOrderFactory } from '../../factories/SDKRelayOrderFactory'
import { SIGNATURE } from '../fixtures'

describe('RelayOrder', () => {
  it('builds an order from the SDK Relay Order', () => {
    const sdkOrder = SDKRelayOrderFactory.buildRelayOrder(ChainId.MAINNET)

    const order = RelayOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN)

    expect(order.chainId).toEqual(ChainId.MAINNET)
    expect(order.orderType).toEqual(OrderType.Relay)
    expect(order.signature).toEqual(SIGNATURE)
    expect(order.inner).toEqual(sdkOrder)
    expect(order.orderStatus).toEqual(ORDER_STATUS.OPEN)
  })
})
