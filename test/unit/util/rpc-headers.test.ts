// RPC_HEADERS reads RPC_HEADER_SECRET at module load, so each case sets the env
// and re-imports the module after resetting the module registry.
describe('RPC_HEADERS', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
    jest.resetModules()
  })

  const loadHeaders = async (): Promise<{ [key: string]: string }> => {
    jest.resetModules()
    return (await import('../../../lib/util/constants')).RPC_HEADERS
  }

  it('always sets the service id header', async () => {
    delete process.env.RPC_HEADER_SECRET
    expect((await loadHeaders())['x-uni-service-id']).toEqual('x_order_service')
  })

  it('adds the x-internal-service-secret header when RPC_HEADER_SECRET is set', async () => {
    process.env.RPC_HEADER_SECRET = 'super-secret-value'
    expect((await loadHeaders())['x-internal-service-secret']).toEqual('super-secret-value')
  })

  it('omits the x-internal-service-secret header when RPC_HEADER_SECRET is unset', async () => {
    delete process.env.RPC_HEADER_SECRET
    expect(await loadHeaders()).not.toHaveProperty('x-internal-service-secret')
  })
})
