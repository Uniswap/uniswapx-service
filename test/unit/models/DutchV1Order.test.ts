import { DutchV1Order } from '../../../lib/models/DutchV1Order'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'

describe('DutchV1Order', () => {
  test('isLimit returns false for dutch order', () => {
    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder()
    const order = new DutchV1Order(sdkOrder, '0x01', 1)
    expect(order.isLimit()).toBe(false)
  })

  test('isLimit returns true for dutch order', () => {
    const sdkOrder = SDKDutchOrderFactory.buildLimitOrder()
    const order = new DutchV1Order(sdkOrder, '0x01', 1)
    expect(order.isLimit()).toBe(true)
  })
})
