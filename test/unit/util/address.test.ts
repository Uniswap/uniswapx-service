import { ethers } from 'ethers'
import { hasExclusiveFiller } from '../../../lib/util/address'

describe('hasExclusiveFiller', () => {
  it('should return true for non-zero addresses', () => {
    expect(hasExclusiveFiller('0xabc1234567890123456789012345678901234567')).toBe(true)
    expect(hasExclusiveFiller('0x123456789abcdef123456789abcdef123456789a')).toBe(true)
    expect(hasExclusiveFiller('0xdef456789012345678901234567890123456789b')).toBe(true)
  })

  it('should return false for zero address', () => {
    expect(hasExclusiveFiller(ethers.constants.AddressZero)).toBe(false)
    expect(hasExclusiveFiller('0x0000000000000000000000000000000000000000')).toBe(false)
    expect(hasExclusiveFiller('0x0000000000000000000000000000000000000000'.toUpperCase())).toBe(false)
  })

  it('should return false for undefined or empty values', () => {
    expect(hasExclusiveFiller(undefined)).toBe(false)
    expect(hasExclusiveFiller('')).toBe(false)
  })

  it('should be case insensitive', () => {
    const testAddress = '0xabc1234567890123456789012345678901234567'
    expect(hasExclusiveFiller(testAddress.toLowerCase())).toBe(true)
    expect(hasExclusiveFiller(testAddress.toUpperCase())).toBe(true)
    expect(hasExclusiveFiller(testAddress)).toBe(true)
  })
})