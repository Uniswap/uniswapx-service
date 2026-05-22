import { ethers } from 'ethers'
import {
  AVERAGE_BLOCK_TIME,
  calculateDutchRetryWaitSeconds,
  MIN_RETRY_WAIT_SECONDS,
  timestampToBlockNumber,
} from '../../../../lib/handlers/check-order-status/util'
import { ChainId } from '../../../../lib/util/chain'

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

  describe('sub-second-block floor', () => {
    it(`floors sub-second block-time chains at MIN_RETRY_WAIT_SECONDS (${1}s)`, () => {
      // AVERAGE_BLOCK_TIME(TEMPO) = 0.5 would round down to 0 in Step
      // Functions Wait granularity without the floor.
      for (const retryCount of [1, 50, 150, 299, 300]) {
        expect(calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)).toEqual(MIN_RETRY_WAIT_SECONDS)
      }
    })

    it('keeps the floor across the exponential backoff range', () => {
      for (const retryCount of [301, 350, 400, 450, 500]) {
        const response = calculateDutchRetryWaitSeconds(ChainId.TEMPO, retryCount)
        expect(response).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS)
      }
    })
  })

  describe('chains with AVERAGE_BLOCK_TIME >= floor are unaffected', () => {
    it('returns AVERAGE_BLOCK_TIME for Arbitrum during the first-hour polling phase (1s)', () => {
      for (const retryCount of [1, 50, 150, 299, 300]) {
        expect(calculateDutchRetryWaitSeconds(ChainId.ARBITRUM_ONE, retryCount)).toEqual(1)
      }
    })

    it('returns AVERAGE_BLOCK_TIME for Unichain during the first-hour polling phase (1s)', () => {
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

describe('timestampToBlockNumber', () => {
  it('handles fractional Tempo block time (0.5s) — 30s wallclock => 60 blocks', () => {
    // Tempo's AVERAGE_BLOCK_TIME is 0.5s; 30s of wallclock should map to
    // 60 blocks. This locks in correct fractional handling so we don't
    // accidentally round to 30 (treating it like a 1s-block chain).
    const refBlockNumber = 1000
    const refTimestamp = 1_700_000_000
    const referenceBlock = {
      number: refBlockNumber,
      timestamp: refTimestamp,
    } as ethers.providers.Block

    const result = timestampToBlockNumber(referenceBlock, refTimestamp + 30, ChainId.TEMPO)
    expect(result - refBlockNumber).toEqual(60)
  })
})
