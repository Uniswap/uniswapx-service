import {
  AVERAGE_BLOCK_TIME,
  calculateDutchRetryWaitSeconds,
  MIN_RETRY_WAIT_SECONDS_TEMPO,
} from '../../../../lib/handlers/check-order-status/util'
import { ChainId } from '../../../../lib/util/chain'
import { BLOCK_TIME_MS_BY_CHAIN } from '../../../../lib/util/constants'

describe('calculateDutchRetryWaitSeconds', () => {
  it('should do exponential backoff when retry count > 300', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 301)
    expect(response).toEqual(13)
  })

  it('should do exponential backoff when retry count > 300', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 350)
    expect(response).toEqual(138)
  })

  it('should cap exponential backoff when wait interval reaches 18000 seconds', async () => {
    const response = calculateDutchRetryWaitSeconds(1, 501)
    expect(response).toEqual(18000)
  })

  describe('Tempo floor', () => {
    it('floors first-hour polling waits at MIN_RETRY_WAIT_SECONDS_TEMPO (Tempo block time = 0.5s)', () => {
      // Without the floor, AVERAGE_BLOCK_TIME(TEMPO) = 0.5 would round down
      // to 0 in Step Functions Wait granularity.
      for (const retryCount of [1, 50, 150, 299, 300]) {
        const response = calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)
        expect(response).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS_TEMPO)
      }
    })

    it('keeps the floor across the exponential backoff range', () => {
      for (const retryCount of [301, 350, 400, 450, 500]) {
        const response = calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)
        expect(response).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS_TEMPO)
      }
    })
  })

  describe('non-Tempo chains are unaffected by the Tempo floor', () => {
    // The Tempo floor must NOT change behavior for chains whose AVERAGE_BLOCK_TIME
    // is already >= 1s. These expectations match the pre-floor base math.
    it('returns AVERAGE_BLOCK_TIME for Arbitrum during the first-hour polling phase (1s, not 2s)', () => {
      for (const retryCount of [1, 50, 150, 299, 300]) {
        expect(calculateDutchRetryWaitSeconds(ChainId.ARBITRUM_ONE, retryCount)).toEqual(1)
      }
    })

    it('returns AVERAGE_BLOCK_TIME for Unichain during the first-hour polling phase (1s, not 2s)', () => {
      for (const retryCount of [1, 50, 150, 299, 300]) {
        expect(calculateDutchRetryWaitSeconds(ChainId.UNICHAIN, retryCount)).toEqual(1)
      }
    })

    it('returns 12s for Mainnet during the first-hour polling phase', () => {
      expect(calculateDutchRetryWaitSeconds(ChainId.MAINNET, 1)).toEqual(12)
      expect(calculateDutchRetryWaitSeconds(ChainId.MAINNET, 300)).toEqual(12)
    })
  })
})

describe('AVERAGE_BLOCK_TIME', () => {
  it('returns 0.5 for Tempo (chainId 4217)', () => {
    expect(AVERAGE_BLOCK_TIME(ChainId.TEMPO)).toEqual(0.5)
  })
})

describe('chain registration sanity', () => {
  it('has BLOCK_TIME_MS_BY_CHAIN defined for Tempo', () => {
    expect(BLOCK_TIME_MS_BY_CHAIN[ChainId.TEMPO]).toBeDefined()
    expect(BLOCK_TIME_MS_BY_CHAIN[ChainId.TEMPO]).toEqual(500)
  })
})
