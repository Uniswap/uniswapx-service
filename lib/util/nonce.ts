import { ethers } from 'ethers'

/**
 * uses crypto.randomBytes() under the hood to generate a 'cryptographically strong'
 *  random data of 28 bytes and prefix that with gouda specific 3-byte value
 * (in total 248 bits, which is the number of words in the Permit2 unorderd nonceBitmap).
 *  We then left shin total ift by 8 bits to form the complete uint256 nonce value.
 *
 * @returns random nonce generated for new wallet addresses
 */
export function generateRandomNonce(): string {
  // TODO: store the prefix bits in an env/config file that is not open-sourced.
  const goudaPrefixBits = ethers.utils.arrayify('0x046832') // 3 bytes
  const randomBits = ethers.utils.randomBytes(28)

  const wordPos = new Uint8Array(31)
  wordPos.set(goudaPrefixBits, 0)
  wordPos.set(randomBits, 3)

  return ethers.BigNumber.from(wordPos).shl(8).toString()
}
