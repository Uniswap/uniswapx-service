import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { buildNonce, getFirstUnsetBit, PERMIT2_MAPPING, splitNonce } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'

const PERMIT2_NONCE_BITMAP_ABI = ['function nonceBitmap(address, uint256) view returns (uint256)']

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

/**
 * Verifies that the nonce after `lastUsedNonce` is still unused on-chain and,
 * if not, advances past any consumed bits in the Permit2 nonceBitmap.
 *
 * The stored nonce only advances when an order is posted through this service,
 * so a nonce consumed on-chain via another path (e.g. an order that never got
 * recorded here) would otherwise be handed out again and fail post-order
 * validation with NonceUsed.
 *
 * Reads a single nonceBitmap word (one eth_call). Bits below the candidate are
 * treated as used so the nonce only ever advances; if the candidate's word has
 * no unused bits left, starts over on a fresh random word.
 *
 * @returns the nonce in 'last used' form (callers derive the next nonce by adding 1)
 * @throws if the chain has no known Permit2 deployment or the RPC call fails
 */
export async function findUnusedNonce(
  provider: StaticJsonRpcProvider,
  chainId: number,
  address: string,
  lastUsedNonce: string
): Promise<string> {
  const permit2Address = PERMIT2_MAPPING[chainId]
  if (!permit2Address) {
    throw new Error(`No Permit2 address for chainId ${chainId}`)
  }

  const candidate = ethers.BigNumber.from(lastUsedNonce).add(1)
  const { word, bitPos } = splitNonce(candidate)

  const permit2 = new ethers.Contract(permit2Address, PERMIT2_NONCE_BITMAP_ABI, provider)
  const bitmap: ethers.BigNumber = await permit2.nonceBitmap(address, word)

  // only ever advance: treat bits below the candidate as used
  const bitsBelowCandidate = ethers.BigNumber.from(2).pow(bitPos).sub(1)
  const firstUnsetBit = getFirstUnsetBit(bitmap.or(bitsBelowCandidate))

  if (firstUnsetBit === -1) {
    // no unused nonces left in the candidate's word; start over on a fresh random word
    return generateRandomNonce()
  }

  return buildNonce(word, firstUnsetBit).sub(1).toString()
}
