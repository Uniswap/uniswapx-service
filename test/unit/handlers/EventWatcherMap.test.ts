import { OrderType, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { EventWatcherMap } from '../../../lib/handlers/EventWatcherMap'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'

describe('EventWatcherMap.createRelayEventWatcherMap', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    process.env.RPC_PREFIX_URL = 'https://example.com/rpc'
  })

  afterAll(() => {
    process.env = savedEnv
  })

  it('does not throw when some supported chains do not have a relay reactor mapping', () => {
    expect(() => EventWatcherMap.createRelayEventWatcherMap()).not.toThrow()
  })

  it('only creates watchers for chains that have relay reactor mapping', () => {
    const map = EventWatcherMap.createRelayEventWatcherMap()
    const missingRelayChain = SUPPORTED_CHAINS.find((chainId) => !REACTOR_ADDRESS_MAPPING[chainId]?.[OrderType.Relay])

    if (missingRelayChain !== undefined) {
      expect(() => map.get(missingRelayChain)).toThrow(`No eventWatcher for chain ${missingRelayChain}`)
    }
  })
})
