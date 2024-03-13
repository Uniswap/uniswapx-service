import { SDKDutchOrderV2Factory } from './SDKDutchOrderV2Factory'

describe('SDKDutchOrderV2Factory', () => {
  it('smoke test - builds a default DutchV2 Order', () => {
    expect(SDKDutchOrderV2Factory.buildDutchV2Order(1)).toBeDefined()
  })
})
