import { getAverageBlockTimeSecs as getSdkAverageBlockTimeSecs } from '@uniswap/sdk-core'
import { getAverageBlockTimeSecs } from '../../../lib/util/block-time'
import { ChainId } from '../../../lib/util/chain'
import { BLOCKS_IN_24_HOURS } from '../../../lib/util/constants'

describe('getAverageBlockTimeSecs', () => {
  // Fails once sdk-core publishes Base's 200 ms cadence: that is the cue to delete
  // the override and go back to sdk-core directly.
  it('overrides Base to the post-Denim 200 ms cadence while sdk-core still says 2 s', () => {
    expect(getSdkAverageBlockTimeSecs(ChainId.BASE)).toBe(2)
    expect(getAverageBlockTimeSecs(ChainId.BASE)).toBe(0.2)
  })

  it.each([ChainId.MAINNET, ChainId.ARBITRUM_ONE, ChainId.UNICHAIN])(
    'passes chainId %d through to sdk-core',
    (chainId) => {
      expect(getAverageBlockTimeSecs(chainId)).toBe(getSdkAverageBlockTimeSecs(chainId))
    }
  )

  it('throws for a chain sdk-core has not registered', () => {
    expect(() => getAverageBlockTimeSecs(999999 as ChainId)).toThrow()
  })
})

describe('BLOCKS_IN_24_HOURS', () => {
  it('counts Base blocks at 200 ms', () => {
    expect(BLOCKS_IN_24_HOURS(ChainId.BASE)).toBe(432000)
  })
})
