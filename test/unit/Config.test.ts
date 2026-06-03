import { getRpcUrl } from '../../lib/Config'

describe('getRpcUrl', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.RPC_1
    delete process.env.RPC_8453
    delete process.env.RPC_143
    delete process.env.RPC_4217
  })

  afterAll(() => {
    process.env = savedEnv
  })

  it('returns the value of the per-chain RPC env var', () => {
    process.env.RPC_1 = 'https://example.com/rpc/mainnet'
    process.env.RPC_4217 = 'https://example.com/rpc/other'
    expect(getRpcUrl(1)).toEqual('https://example.com/rpc/mainnet')
    expect(getRpcUrl(4217)).toEqual('https://example.com/rpc/other')
  })

  it('returns the URL exactly as provided (no path manipulation)', () => {
    process.env.RPC_8453 = 'https://example.com/rpc/base/'
    expect(getRpcUrl(8453)).toEqual('https://example.com/rpc/base/')
  })

  it('throws when the per-chain RPC env var is not set', () => {
    expect(() => getRpcUrl(143)).toThrow(/No RPC for chain 143: set RPC_143/)
  })
})
