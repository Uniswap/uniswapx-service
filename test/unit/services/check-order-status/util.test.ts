import {
  AVERAGE_BLOCK_TIME,
  calculateDutchRetryWaitSeconds,
  MIN_RETRY_WAIT_SECONDS,
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

  it('should never return less than the minimum wait floor for sub-second-block chains (Tempo)', () => {
    // First-hour polling phase: AVERAGE_BLOCK_TIME(TEMPO) = 0.5, must be floored.
    for (const retryCount of [1, 50, 150, 299, 300]) {
      const response = calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)
      expect(response).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS)
    }
  })

  it('should never return less than the minimum wait floor across the exponential backoff range', () => {
    for (const retryCount of [301, 350, 400, 450, 500]) {
      const response = calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)
      expect(response).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS)
    }
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
