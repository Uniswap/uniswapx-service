import { SDKDutchOrderV2Factory } from './SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from './SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from './SDKPriorityOrderFactory'

describe('SDKOrderFactories', () => {
  it('smoke test - builds a default DutchV2 Order', () => {
    expect(SDKDutchOrderV2Factory.buildDutchV2Order()).toBeDefined()
  })
  it('smoke test - builds a default DutchV3 Order', () => {
    expect(SDKDutchOrderV3Factory.buildDutchV3Order()).toBeDefined()
  })
  it('smoke test - builds a default Priority Order', () => {
    expect(SDKPriorityOrderFactory.buildPriorityOrder()).toBeDefined()
  })
})
