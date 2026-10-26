import { ethers } from 'ethers'
import { ORDER_STATUS } from '../../../../lib/entities'
import {
  AVERAGE_BLOCK_TIME,
  calculateDutchRetryWaitSeconds,
  calculateLimitRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  LIMIT_FILL_EVENT_LOOKBACK_BLOCKS,
  LIMIT_ORDER_BLOCK_CADENCE_AGE_SECONDS,
  LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS,
  LIMIT_ORDER_OPEN_POLL_SECONDS,
  MIN_RETRY_WAIT_SECONDS,
  timestampToBlockNumber,
} from '../../../../lib/handlers/check-order-status/util'
import { ChainId, SUPPORTED_CHAINS } from '../../../../lib/util/chain'

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

    // Arc (0.48s) and Robinhood (0.1s) are both sub-second; the global floor
    // prevents the Step Functions Wait granularity from rounding to 0.
    it.each([ChainId.ARC, ChainId.ROBINHOOD])('floors chainId %d at MIN_RETRY_WAIT_SECONDS', (chainId) => {
      for (const retryCount of [1, 50, 150, 299, 300]) {
        expect(calculateDutchRetryWaitSeconds(chainId, retryCount)).toEqual(MIN_RETRY_WAIT_SECONDS)
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

  // A chain added to SUPPORTED_CHAINS before sdk-core registers its block time
  // throws on every status poll, so fail here instead.
  it.each(SUPPORTED_CHAINS)('is registered in sdk-core for supported chainId %d', (chainId) => {
    expect(AVERAGE_BLOCK_TIME(chainId)).toBeGreaterThan(0)
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

describe('calculateLimitRetryWaitSeconds', () => {
  const nowSeconds = 1_800_000_000
  const youngCreatedAt = nowSeconds - 60
  const oldCreatedAt = nowSeconds - LIMIT_ORDER_BLOCK_CADENCE_AGE_SECONDS - 1

  it('polls every block while the order is young', () => {
    expect(
      calculateLimitRetryWaitSeconds(ChainId.MAINNET, 1, {
        orderStatus: ORDER_STATUS.OPEN,
        createdAt: youngCreatedAt,
        nowSeconds,
      })
    ).toEqual(12)
  })

  it('slows open orders down once they are past the young window', () => {
    expect(
      calculateLimitRetryWaitSeconds(ChainId.MAINNET, 1, {
        orderStatus: ORDER_STATUS.OPEN,
        createdAt: oldCreatedAt,
        nowSeconds,
      })
    ).toEqual(LIMIT_ORDER_OPEN_POLL_SECONDS)
  })

  it('does not depend on retryCount, which resets on every execution restart', () => {
    for (const retryCount of [0, 150, 300, 301, 1000]) {
      expect(
        calculateLimitRetryWaitSeconds(ChainId.MAINNET, retryCount, {
          orderStatus: ORDER_STATUS.OPEN,
          createdAt: oldCreatedAt,
          nowSeconds,
        })
      ).toEqual(LIMIT_ORDER_OPEN_POLL_SECONDS)
    }
  })

  it('polls orders without funds least often, even when young', () => {
    for (const createdAt of [youngCreatedAt, oldCreatedAt]) {
      expect(
        calculateLimitRetryWaitSeconds(ChainId.MAINNET, 1, {
          orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
          createdAt,
          nowSeconds,
        })
      ).toEqual(LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS)
    }
  })

  it('polls every block while a nonce-used or expired grace poll is pending', () => {
    expect(
      calculateLimitRetryWaitSeconds(ChainId.MAINNET, 1, {
        orderStatus: ORDER_STATUS.OPEN,
        getFillLogAttempts: 1,
        createdAt: oldCreatedAt,
        nowSeconds,
      })
    ).toEqual(12)
  })

  it('treats an order of unknown age as past the young window', () => {
    expect(calculateLimitRetryWaitSeconds(ChainId.MAINNET, 1, { orderStatus: ORDER_STATUS.OPEN, nowSeconds })).toEqual(
      LIMIT_ORDER_OPEN_POLL_SECONDS
    )
  })

  it('returns whole seconds of at least MIN_RETRY_WAIT_SECONDS on sub-second and fractional block-time chains', () => {
    for (const chainId of [ChainId.TEMPO, ChainId.ROBINHOOD, ChainId.POLYGON]) {
      const wait = calculateLimitRetryWaitSeconds(chainId, 1, {
        orderStatus: ORDER_STATUS.OPEN,
        createdAt: youngCreatedAt,
        nowSeconds,
      })
      expect(Number.isInteger(wait)).toBe(true)
      expect(wait).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_SECONDS)
    }
  })
})

describe('LIMIT_FILL_EVENT_LOOKBACK_BLOCKS', () => {
  it.each([ChainId.MAINNET, ChainId.POLYGON, ChainId.BASE, ChainId.ARBITRUM_ONE])(
    'covers the longest limit-order poll interval on chainId %d',
    (chainId) => {
      const lookbackSeconds = LIMIT_FILL_EVENT_LOOKBACK_BLOCKS(chainId) * AVERAGE_BLOCK_TIME(chainId)
      expect(lookbackSeconds).toBeGreaterThanOrEqual(LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS)
      expect(LIMIT_FILL_EVENT_LOOKBACK_BLOCKS(chainId)).toBeGreaterThan(FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId))
    }
  )
})
