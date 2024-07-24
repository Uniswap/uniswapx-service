import { SDKPriorityOrderFactory } from './SDKPriorityOrderFactory'

describe('SDKPriorityOrderV2Factory', () => {
  it('smoke test - builds a default DutchV2 Order', () => {
    expect(SDKPriorityOrderFactory.buildPriorityOrder()).toBeDefined()
  })
})
