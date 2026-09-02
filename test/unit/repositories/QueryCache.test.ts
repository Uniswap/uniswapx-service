import { QueryCache } from '../../../lib/repositories/QueryCache'

describe('QueryCache', () => {
  it('returns a stored value inside the TTL window', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'value', 1_000)

    expect(cache.get('a', 1_000)).toEqual('value')
    expect(cache.get('a', 1_249)).toEqual('value')
  })

  it('expires a value once the TTL elapses', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'value', 1_000)

    expect(cache.get('a', 1_250)).toBeUndefined()
    expect(cache.size).toEqual(0)
  })

  it('misses on an unknown key', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'value', 1_000)

    expect(cache.get('b', 1_000)).toBeUndefined()
  })

  it('is disabled when the TTL is zero', () => {
    const cache = new QueryCache<string>(0, 'Test')
    cache.set('a', 'value', 1_000)

    expect(cache.enabled).toEqual(false)
    expect(cache.get('a', 1_000)).toBeUndefined()
    expect(cache.size).toEqual(0)
  })

  it('sweeps expired entries on write', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'a', 1_000)
    cache.set('b', 'b', 1_100)
    expect(cache.size).toEqual(2)

    // 'a' has expired by now, 'b' has not
    cache.set('c', 'c', 1_300)

    expect(cache.size).toEqual(2)
    expect(cache.get('a', 1_300)).toBeUndefined()
    expect(cache.get('b', 1_300)).toEqual('b')
    expect(cache.get('c', 1_300)).toEqual('c')
  })

  it('bounds the number of live entries', () => {
    const cache = new QueryCache<number>(250, 'Test', 3)
    // All written at the same instant so none can be evicted for being expired.
    for (let i = 0; i < 10; i++) {
      cache.set(`key-${i}`, i, 1_000)
    }

    expect(cache.size).toEqual(3)
    // The oldest keys are dropped first; the most recent writes survive.
    expect(cache.get('key-0', 1_000)).toBeUndefined()
    expect(cache.get('key-9', 1_000)).toEqual(9)
  })

  it('keeps expiry aligned with insertion order when a key is overwritten', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'first', 1_000)
    cache.set('b', 'b', 1_100)
    // Re-writing 'a' must move it behind 'b', otherwise the eviction sweep would stop at
    // 'a' and leave genuinely expired entries in the map.
    cache.set('a', 'second', 1_200)

    expect(cache.get('a', 1_400)).toEqual('second')

    // 'b' expires at 1_350; writing past that point must sweep it.
    cache.set('c', 'c', 1_400)
    expect(cache.get('b', 1_400)).toBeUndefined()
    expect(cache.get('a', 1_400)).toEqual('second')
  })

  it('reports how many live entries a write evicted for capacity', () => {
    const cache = new QueryCache<string>(250, 'Test', 2)
    expect(cache.set('a', 'a', 1_000)).toEqual(0)
    expect(cache.set('b', 'b', 1_000)).toEqual(0)
    // Full, so a third live key pushes the oldest out.
    expect(cache.set('c', 'c', 1_000)).toEqual(1)
    // Expired entries are swept, not evicted: no capacity pressure is reported.
    expect(cache.set('d', 'd', 1_300)).toEqual(0)
    expect(cache.size).toEqual(1)
  })

  it('clears all entries', () => {
    const cache = new QueryCache<string>(250, 'Test')
    cache.set('a', 'value', 1_000)
    cache.clear()

    expect(cache.size).toEqual(0)
    expect(cache.get('a', 1_000)).toBeUndefined()
  })
})
