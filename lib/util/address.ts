import { ethers } from 'ethers'

/**
 * Checks if the given filler address represents an exclusive filler
 * An exclusive filler is any non-zero address
 * 
 * @param filler - The filler address to check
 * @returns true if the filler is exclusive (not zero address), false otherwise
 */
export function hasExclusiveFiller(filler?: string): filler is string {
  return !!filler && filler.toLowerCase() !== ethers.constants.AddressZero.toLowerCase()
}