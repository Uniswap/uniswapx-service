import {
  UNIMIND_MAX_TAU_BPS,
  UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD,
  UNIMIND_UPDATE_THRESHOLD,
  UNIMIND_CIRCUIT_BREAKER_MAX_BATCH,
  UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS,
  UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD,
  UNIMIND_DEV_SWAPPER_ADDRESS,
} from '../../../lib/util/constants'

describe('Unimind constants sanity checks', () => {
  it('UNIMIND_MAX_TAU_BPS should be positive', () => {
    expect(UNIMIND_MAX_TAU_BPS).toBeGreaterThan(0)
  })

  it('UNIMIND_UPDATE_THRESHOLD should be a positive integer', () => {
    expect(UNIMIND_UPDATE_THRESHOLD).toBeGreaterThan(0)
    expect(Number.isInteger(UNIMIND_UPDATE_THRESHOLD)).toBe(true)
  })

  it('UNIMIND_CIRCUIT_BREAKER_MAX_BATCH should be a non-negative integer', () => {
    expect(UNIMIND_CIRCUIT_BREAKER_MAX_BATCH).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(UNIMIND_CIRCUIT_BREAKER_MAX_BATCH)).toBe(true)
  })

  it('UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS should be a positive integer', () => {
    expect(UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS).toBeGreaterThan(0)
    expect(Number.isInteger(UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS)).toBe(true)
  })

  it('UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD should be between 0 and 1', () => {
    expect(UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD).toBeGreaterThanOrEqual(0)
    expect(UNIMIND_CIRCUIT_BREAKER_FILL_RATE_THRESHOLD).toBeLessThanOrEqual(1)
  })

  it('UNIMIND_DEV_SWAPPER_ADDRESS should be a valid hex address', () => {
    expect(UNIMIND_DEV_SWAPPER_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS should not exceed UNIMIND_UPDATE_THRESHOLD', () => {
    expect(UNIMIND_CIRCUIT_BREAKER_MIN_ORDERS).toBeLessThanOrEqual(UNIMIND_UPDATE_THRESHOLD)
  })
})
