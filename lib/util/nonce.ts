import { ethers } from 'ethers'

/**
 * uses crypto.randomBytes() under the hood to generate a 'cryptographically strong'
 *  random data of 31 bytes (248 bits, which is the number of words in
 *  the Permit2 unorderd nonceBitmap). We then left shift by 8 bits
 *  to form the complete uint256 nonce value.
 *
 * @returns random nonce generated for new wallet addresses
 */
export function generateRandomNonce(): string {
  // TODO: prefix random function with some Gouda specific bits
  const wordPos = ethers.BigNumber.from(ethers.utils.randomBytes(31))
  return wordPos.shl(8).toString()
}
