// RPC_HEADERS reads RPC_HEADER_SECRET at module load, so each case sets the env
// and re-imports the module in isolation.
describe('RPC_HEADERS', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
    jest.resetModules()
  })

  const loadHeaders = (): { [key: string]: string } => {
    let headers: { [key: string]: string } = {}
    jest.isolateModules(() => {
      headers = require('../../../lib/util/constants').RPC_HEADERS
    })
    return headers
  }

  it('always sets the service id header', () => {
    delete process.env.RPC_HEADER_SECRET
    expect(loadHeaders()['x-uni-service-id']).toEqual('x_order_service')
  })

  it('adds the x-internal-service-secret header when RPC_HEADER_SECRET is set', () => {
    process.env.RPC_HEADER_SECRET = 'super-secret-value'
    expect(loadHeaders()['x-internal-service-secret']).toEqual('super-secret-value')
  })

  it('omits the x-internal-service-secret header when RPC_HEADER_SECRET is unset', () => {
    delete process.env.RPC_HEADER_SECRET
    expect(loadHeaders()).not.toHaveProperty('x-internal-service-secret')
  })
})
