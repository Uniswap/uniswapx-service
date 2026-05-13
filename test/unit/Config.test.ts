import { getRpcUrl } from '../../lib/Config'

describe('getRpcUrl', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.RPC_PREFIX_URL
    delete process.env.RPC_1
    delete process.env.RPC_4217
  })

  afterAll(() => {
    process.env = savedEnv
  })

  it('returns the per-chain override when RPC_<chainId> is set', () => {
    process.env.RPC_1 = 'https://example.com/mainnet'
    process.env.RPC_PREFIX_URL = 'https://example.com/rpc'
    expect(getRpcUrl(1)).toEqual('https://example.com/mainnet')
  })

  it('falls back to RPC_PREFIX_URL + chainId when no override is set', () => {
    process.env.RPC_PREFIX_URL = 'https://example.com/rpc'
    expect(getRpcUrl(1)).toEqual('https://example.com/rpc/1')
    expect(getRpcUrl(4217)).toEqual('https://example.com/rpc/4217')
  })

  it('tolerates a trailing slash on RPC_PREFIX_URL', () => {
    process.env.RPC_PREFIX_URL = 'https://example.com/rpc/'
    expect(getRpcUrl(8453)).toEqual('https://example.com/rpc/8453')
  })

  it('throws when neither RPC_<chainId> nor RPC_PREFIX_URL is set', () => {
    expect(() => getRpcUrl(143)).toThrow(/No RPC for chain 143/)
  })
})
