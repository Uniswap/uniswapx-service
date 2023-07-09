import { ethers } from 'ethers'
import { generateRandomNonce } from '../../lib/util/nonce'

const MAX_UINT256 = ethers.BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

describe('random nonce generation test', () => {
  it('should generate an in-range nonce with prefixed uniswapx bits', () => {
    const nonceBN = ethers.BigNumber.from(generateRandomNonce())

    expect(nonceBN.lt(ethers.BigNumber.from(MAX_UINT256))).toBeTruthy()
    expect(nonceBN.toHexString().startsWith('0x046832')).toBeTruthy()
  })
})
