import { SDKRelayOrderFactory } from './SDKRelayOrderFactory'

describe('SDKRelayOrderFactory', () => {
  it('smoke test - builds a default Relay Order', () => {
    expect(SDKRelayOrderFactory.buildRelayOrder(1)).toBeDefined()
  })
})
