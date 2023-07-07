import { ethers } from 'ethers'

/**
 * uses crypto.randomBytes() under the hood to generate a 'cryptographically strong'
 *  random data of 28 bytes and prefix that with uniswapx specific 3-byte value
 * (in total 248 bits, which is the number of words in the Permit2 unorderd nonceBitmap).
 *  We then left shin total ift by 8 bits to form the complete uint256 nonce value; we do
 *    this because we want the first nonce to land on the word boundary to save gas (clean sstore
 *     for the next 256 nonce value)
 * @returns random nonce generated for new wallet addresses
 */
export function generateRandomNonce(): string {
  // TODO: store the prefix bits in an env/config file that is not open-sourced.
  return ethers.BigNumber.from('0x046832')
    .shl(224) // 28 bytes
    .or(ethers.BigNumber.from(ethers.utils.randomBytes(28)))
    .shl(8)
    .toString()
}
