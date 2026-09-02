import { OrderEntityType } from './base'

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const DEFAULT_QUERY_CACHE_TTL_MS = 500

// Set GET_ORDERS_CACHE_TTL_MS=0 to disable the query cache without a code change.
export function queryCacheTtlFromEnv(): number {
  const raw = process.env.GET_ORDERS_CACHE_TTL_MS
  if (!raw) {
    return DEFAULT_QUERY_CACHE_TTL_MS
  }
  const configured = Number(raw)
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_QUERY_CACHE_TTL_MS
}

/**
 * Process-local TTL cache for read-only DynamoDB query results.
 *
 * Fillers poll the same chainId/orderStatus combinations continuously, so within a few
 * hundred milliseconds many requests ask for the same partition. Those queries all land on
 * a single GSI partition key (e.g. `1_open`), which DynamoDB caps at ~3000 RCU/s regardless
 * of the table's billing mode. Serving repeats from memory collapses them into one read and
 * keeps the partition below that ceiling.
 *
 * The cache is per execution environment, so the DynamoDB read rate it allows is roughly
 * (environments x distinct keys) / TTL. Keeping the key count small matters as much as the
 * TTL: the repository keys entries by partition alone and serves every limit and type
 * filter from the same page.
 *
 * The map is bounded regardless: an unbounded one would be a memory leak in a long-lived
 * execution environment.
 */
export class QueryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()

  // metricPrefix names the metrics emitted by repositories using this cache
  // (e.g. 'GetOrdersQueryCache' -> GetOrdersQueryCacheHit/Miss/Size/...). Each endpoint
  // owns its cache instance, so its traffic stays distinguishable on dashboards.
  constructor(
    private readonly ttlMs: number,
    public readonly metricPrefix: string,
    private readonly maxEntries = 1000
  ) {}

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

  /**
   * Stores a value. Returns how many live entries were dropped to stay under maxEntries;
   * anything above zero means the working set no longer fits and hits are being lost to
   * capacity rather than to the TTL.
   */
  public set(key: string, value: T, now: number): number {
    if (!this.enabled) {
      return 0
    }
    const capacityEvictions = this.evict(now)
    // Re-inserting an existing key keeps its original position in a Map, which would break
    // the insertion-order-equals-expiry-order invariant evict() relies on. Delete first.
    this.store.delete(key)
    this.store.set(key, { expiresAt: now + this.ttlMs, value })
    return capacityEvictions
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
   * Returns the number of still-live entries dropped for capacity.
   */
  private evict(now: number): number {
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > now) {
        break
      }
      this.store.delete(key)
    }
    let capacityEvictions = 0
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next()
      if (oldest.done) {
        break
      }
      this.store.delete(oldest.value)
      capacityEvictions++
    }
    return capacityEvictions
  }
}

// A cached entry is the raw newest page for one partition; callers slice and filter it per
// request. lastEvaluatedKey is DynamoDB's continuation key when the partition held more rows
// than the page, so a paginated caller can still be handed a cursor.
export type CachedQueryPage = {
  orders: OrderEntityType[]
  lastEvaluatedKey?: Record<string, unknown>
}
export type OrdersQueryCache = QueryCache<CachedQueryPage>
