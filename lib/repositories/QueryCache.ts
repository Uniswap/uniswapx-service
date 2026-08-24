type CacheEntry<T> = {
  expiresAt: number
  value: T
}

/**
 * Process-local TTL cache for read-only DynamoDB query results.
 *
 * Fillers poll the same chainId/orderStatus combinations continuously, so within a few
 * hundred milliseconds many requests ask for a byte-identical page. Those queries all
 * land on a single GSI partition key (e.g. `1_open`), which DynamoDB caps at ~3000 RCU/s
 * regardless of the table's billing mode. Serving repeats from memory collapses them into
 * one read and keeps the partition below that ceiling.
 *
 * Query keys embed caller-supplied values (swapper, pair, cursor), so the map is bounded:
 * an unbounded one would be a memory leak in a long-lived execution environment.
 */
export class QueryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()

  constructor(private readonly ttlMs: number, private readonly maxEntries = 1000) {}

  public get enabled(): boolean {
    return this.ttlMs > 0
  }

  public get(key: string, now: number): T | undefined {
    if (!this.enabled) {
      return undefined
    }
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expiresAt <= now) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  public set(key: string, value: T, now: number): void {
    if (!this.enabled) {
      return
    }
    this.evict(now)
    // Re-inserting an existing key keeps its original position in a Map, which would break
    // the insertion-order-equals-expiry-order invariant evict() relies on. Delete first.
    this.store.delete(key)
    this.store.set(key, { expiresAt: now + this.ttlMs, value })
  }

  public get size(): number {
    return this.store.size
  }

  public clear(): void {
    this.store.clear()
  }

  /**
   * Every entry gets the same TTL, so insertion order is also expiry order: we can stop
   * sweeping at the first live entry, and drop from the front when over capacity.
   */
  private evict(now: number): void {
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > now) {
        break
      }
      this.store.delete(key)
    }
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next()
      if (oldest.done) {
        break
      }
      this.store.delete(oldest.value)
    }
  }
}
