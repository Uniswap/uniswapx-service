import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { buildNonce, PERMIT2_MAPPING } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { findUnusedNonce, generateRandomNonce } from '../../../lib/util/nonce'

const MAX_UINT256 = ethers.BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

describe('random nonce generation test', () => {
  it('should generate an in-range nonce with prefixed uniswapx bits', () => {
    const nonceBN = ethers.BigNumber.from(generateRandomNonce())

    expect(nonceBN.lt(ethers.BigNumber.from(MAX_UINT256))).toBeTruthy()
    expect(nonceBN.toHexString().startsWith('0x046832')).toBeTruthy()
  })
})

describe('findUnusedNonce', () => {
  const CHAIN_ID = 1
  const ADDRESS = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'
  // Fixed uniswapx-prefixed word (same shape as generateRandomNonce() >> 8, i.e. the
  // 0x046832 prefix in the top bits) so any failure is reproducible run-to-run.
  const WORD = ethers.BigNumber.from('0x046832').shl(224)

  const mockProvider = (bitmap: ethers.BigNumber) => {
    const call = jest.fn().mockResolvedValue(ethers.utils.defaultAbiCoder.encode(['uint256'], [bitmap]))
    const provider = { _isProvider: true, call } as unknown as StaticJsonRpcProvider
    return { provider, call }
  }

  it('returns the stored nonce unchanged when the next nonce is unused on-chain', async () => {
    const lastUsedNonce = buildNonce(WORD, 5)
    const bitmap = ethers.BigNumber.from(0b111111) // bits 0-5 used, bit 6 free
    const { provider } = mockProvider(bitmap)

    const nonce = await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    expect(nonce).toEqual(lastUsedNonce.toString())
  })

  it('advances past nonces already consumed on-chain', async () => {
    const lastUsedNonce = buildNonce(WORD, 5)
    // bits 6 and 7 were consumed outside of the service; first unused bit is 8
    const bitmap = ethers.BigNumber.from(0b11111111)
    const { provider } = mockProvider(bitmap)

    const nonce = await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    // returned in 'last used' form: one below the first unused nonce
    expect(nonce).toEqual(buildNonce(WORD, 7).toString())
  })

  it('does not go backwards when lower bits of the word are unused', async () => {
    const lastUsedNonce = buildNonce(WORD, 100)
    const bitmap = ethers.BigNumber.from(0) // nothing used on-chain
    const { provider } = mockProvider(bitmap)

    const nonce = await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    expect(nonce).toEqual(lastUsedNonce.toString())
  })

  it('rolls over to the next word when the stored nonce is the last bit of its word', async () => {
    const lastUsedNonce = buildNonce(WORD, 255)
    const bitmap = ethers.BigNumber.from(0)
    const { provider, call } = mockProvider(bitmap)

    const nonce = await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    expect(nonce).toEqual(lastUsedNonce.toString())
    // the bitmap of the *next* word should have been queried
    const iface = new ethers.utils.Interface(['function nonceBitmap(address, uint256) view returns (uint256)'])
    const [queriedAddress, queriedWord] = iface.decodeFunctionData('nonceBitmap', call.mock.calls[0][0].data)
    expect(queriedAddress.toLowerCase()).toEqual(ADDRESS.toLowerCase())
    expect(queriedWord.toString()).toEqual(WORD.add(1).toString())
  })

  it('queries the canonical Permit2 deployment', async () => {
    const lastUsedNonce = buildNonce(WORD, 5)
    const { provider, call } = mockProvider(ethers.BigNumber.from(0))

    await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    expect(call.mock.calls[0][0].to.toLowerCase()).toEqual(PERMIT2_MAPPING[CHAIN_ID].toLowerCase())
  })

  it('starts over on a fresh random word when the current word is fully used', async () => {
    const lastUsedNonce = buildNonce(WORD, 5)
    const { provider } = mockProvider(MAX_UINT256)

    const nonce = await findUnusedNonce(provider, CHAIN_ID, ADDRESS, lastUsedNonce.toString())

    const nonceBN = ethers.BigNumber.from(nonce)
    expect(nonceBN.toHexString().startsWith('0x046832')).toBeTruthy()
    expect(nonceBN.div(256).eq(WORD)).toBeFalsy()
  })

  it('throws for a chain without a known Permit2 deployment', async () => {
    const { provider } = mockProvider(ethers.BigNumber.from(0))

    await expect(findUnusedNonce(provider, 123456, ADDRESS, '1')).rejects.toThrow(
      'No Permit2 address for chainId 123456'
    )
  })
})
