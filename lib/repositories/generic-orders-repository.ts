import { Unit } from 'aws-embedded-metrics'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { TABLE_KEY } from '../config/dynamodb'
import { ORDER_STATUS, SettledAmount, SORT_FIELDS } from '../entities'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { log } from '../Logging'
import { checkDefined } from '../preconditions/preconditions'
import { ComparisonFilter, parseComparisonFilter } from '../util/comparison'
import { decode, encode } from '../util/encryption'
import { metrics } from '../util/metrics'
import { generateRandomNonce } from '../util/nonce'
import { currentTimestampInSeconds } from '../util/time'
import { BaseOrdersRepository, OrderEntityType, QueryResult } from './base'
import { IndexMapper } from './IndexMappers/IndexMapper'
import { CachedQueryPage, OrdersQueryCache } from './QueryCache'

export const MAX_ORDERS = 50

/**
 * Rows fetched per DynamoDB read on the cached path. Every request against a partition is
 * served from this one page whatever its own limit or type filter, so it has to cover the
 * partition's working set: a chain never carries more than ~100 open Dutch orders, and the
 * API hands back at most MAX_ORDERS of them anyway. Partitions with more rows than this
 * (the LimitOrders table's `open`, historical statuses) still return their newest page.
 */
export const CACHED_QUERY_PAGE_SIZE = 100

export type QueryFilter = { or: boolean; attr: string; eq: string }

/**
 * Only partitions whose key is built from enum-validated request values are cached:
 * orderStatus (ORDER_STATUS), chainId (SUPPORTED_CHAINS) and their combination. That bounds
 * the distinct keys to a few hundred per table no matter what callers send. A swapper,
 * filler or pair is free text as far as the cache is concerned: an attacker could spray
 * values to flood the map and evict the hot entries it exists for, and legitimate traffic on
 * those partitions is per-caller and rarely repeats inside a TTL anyway.
 */
const CACHEABLE_INDEXES: string[] = [TABLE_KEY.ORDER_STATUS, TABLE_KEY.CHAIN_ID, TABLE_KEY.CHAIN_ID_ORDER_STATUS]

/**
 * Only the plain first page of a partition is shared. A cursor or a sort-key comparison
 * names a different slice on every call, so caching those would only add keys: they read
 * DynamoDB directly.
 */
export function isCacheableQuery(index: string, cursor?: string, sortKey?: SORT_FIELDS): boolean {
  if (cursor || sortKey) {
    return false
  }
  return CACHEABLE_INDEXES.includes(index)
}

// In-memory equivalent of the `{ or: true, attr, eq }` FilterExpression list: any clause matching.
function matchesAnyFilter(order: object, filters: QueryFilter[]): boolean {
  return filters.some((filter) => (order as Record<string, unknown>)[filter.attr] === filter.eq)
}

// aws-sdk v2 (used by dynamodb-toolbox here) sets both code and name to the error code
function isConditionalCheckFailed(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'ConditionalCheckFailedException'
}

// Shared implementation for Dutch and Limit orders
// will work for orders with the same GSIs
export abstract class GenericOrdersRepository<
  TableName extends string,
  PartitionKey extends string,
  SortKey extends string | null,
  T extends OrderEntityType
> implements BaseOrdersRepository<T>
{
  public constructor(
    private readonly table: Table<TableName, PartitionKey, SortKey>,
    private readonly entity: Entity,
    private readonly nonceEntity: Entity,
    private readonly log: Logger,
    private readonly indexMapper: IndexMapper<T>,
    private readonly queryCache?: OrdersQueryCache
  ) {}

  public async getByOfferer(
    offerer: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult<T>> {
    return await this.queryOrderEntity(offerer, TABLE_KEY.OFFERER, limit, cursor, sortKey, sort, desc)
  }

  public async getByOrderStatus(
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult<T>> {
    return await this.queryOrderEntity(orderStatus, TABLE_KEY.ORDER_STATUS, limit, cursor, sortKey, sort, desc)
  }

  public async getByHash(hash: string): Promise<T | undefined> {
    const res = await this.entity.get({ [TABLE_KEY.ORDER_HASH]: hash }, { execute: true })
    return res.Item as T
  }

  public async getNonceByAddressAndChain(address: string, chainId: number): Promise<string> {
    const res = await this.nonceEntity.query(`${address}-${chainId}`, {
      limit: 1,
      reverse: true,
      consistent: true,
      execute: true,
    })
    if (res.Items && res.Items.length > 0) {
      return res.Items[0].nonce
    }
    return generateRandomNonce()
  }

  public async countOrdersByOffererAndStatus(offerer: string, orderStatus: ORDER_STATUS): Promise<number> {
    const res = await this.entity.query(`${offerer}_${orderStatus}`, {
      index: 'offerer_orderStatus-createdAt-all',
      execute: true,
      select: 'COUNT',
    })

    return res.Count || 0
  }

  public async putOrderAndUpdateNonceTransaction(order: T): Promise<void> {
    await this.table.transactWrite(
      [
        this.entity.putTransaction({
          ...order,
          ...this.indexMapper.getIndexFieldsForUpdate(order),
          createdAt: currentTimestampInSeconds(),
        }),
        this.nonceEntity.updateTransaction({
          offerer: `${order.offerer}-${order.chainId}`,
          nonce: order.nonce,
        }),
      ],
      {
        capacity: 'total',
        execute: true,
      }
    )
  }

  public async updateOrderStatus(
    orderHash: string,
    status: ORDER_STATUS,
    txHash?: string,
    fillBlock?: number,
    settledAmounts?: SettledAmount[]
  ): Promise<void> {
    try {
      const order = checkDefined(
        await this.getByHash(orderHash),
        `cannot find order by hash when updating order status, hash: ${orderHash}`
      )

      // FILLED is terminal; the DynamoDB condition makes the no-downgrade check atomic with the write
      const conditions =
        status === ORDER_STATUS.FILLED
          ? {}
          : { conditions: [{ attr: TABLE_KEY.ORDER_STATUS, ne: ORDER_STATUS.FILLED }] }
      await this.entity.update(
        {
          [TABLE_KEY.ORDER_HASH]: orderHash,
          ...this.indexMapper.getIndexFieldsForStatusUpdate(order, status),
          ...(txHash && { txHash }),
          ...(fillBlock && { fillBlock }),
          ...(settledAmounts && { settledAmounts }),
        },
        conditions
      )
    } catch (e) {
      if (isConditionalCheckFailed(e)) {
        // the order was FILLED by another writer since our read; skip the downgrade rather than throw
        log.warn('skipping updateOrderStatus: order is already in terminal status FILLED', { orderHash, status })
        return
      }
      log.error('updateOrderStatus error', { error: e })
      throw e
    }
  }

  public async deleteOrders(orderHashes: string[]): Promise<void> {
    await this.table.batchWrite(
      orderHashes.map((hash) => this.entity.deleteBatch({ orderHash: hash })),
      { execute: true }
    )
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, cursor?: string): Promise<QueryResult<T>> {
    return this.getOrdersWithFilters(limit, queryFilters, cursor)
  }

  public async getOrdersFilteredByType(
    limit: number,
    queryFilters: GetOrdersQueryParams,
    types: string[],
    cursor?: string
  ): Promise<QueryResult<T>> {
    // https://www.dynamodbtoolbox.com/docs/filters-and-conditions
    // match any type passed in types (e.g. Dutch OR Dutch_V2)
    const filters = types.map((t) => {
      return { or: true, attr: 'type', eq: t }
    })
    return this.getOrdersWithFilters(limit, queryFilters, cursor, filters)
  }

  private async getOrdersWithFilters(
    limit: number,
    queryFilters: GetOrdersQueryParams,
    cursor?: string,
    filters: { or: boolean; attr: string; eq: string }[] = []
  ): Promise<QueryResult<T>> {
    // If orderStatus is an array, fan out parallel queries (one per status) and merge
    if (Array.isArray(queryFilters.orderStatus)) {
      return this.getOrdersForMultipleStatuses(limit, queryFilters, filters)
    }

    const requestedParams = this.getRequestedParams(queryFilters)
    // Query Orders table based on the requested params
    const compoundIndex = this.indexMapper.getIndexFromParams(queryFilters)

    if (compoundIndex) {
      return this.queryOrderEntity(
        compoundIndex.partitionKey,
        compoundIndex.index,
        limit,
        cursor,
        queryFilters['sortKey'],
        queryFilters['sort'],
        queryFilters['desc'],
        filters
      )
    }

    switch (true) {
      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return { orders: order ? [order] : [] }
      }

      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASHES): {
        const orderHashes = queryFilters['orderHashes'] as string[]
        const batchQuery = await this.table.batchGet(
          orderHashes.map((orderHash) => this.entity.getBatch({ orderHash })),
          { execute: true }
        )
        const tableName = this.table.name
        return { orders: batchQuery.Responses[tableName] }
      }

      default: {
        throw new Error(
          'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler, pair]'
        )
      }
    }
  }

  private async getOrdersForMultipleStatuses(
    limit: number,
    queryFilters: GetOrdersQueryParams,
    filters: { or: boolean; attr: string; eq: string }[] = []
  ): Promise<QueryResult<T>> {
    const statuses = queryFilters.orderStatus as string[]
    const effectiveLimit = limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS

    const results = await Promise.all(
      statuses.map((status) =>
        this.getOrdersWithFilters(effectiveLimit, { ...queryFilters, orderStatus: status }, undefined, filters)
      )
    )

    // The per-status sub-queries are independent reads (and independent cache entries), so
    // one can be up to a TTL staler than another and list the same order under both
    // statuses. Transitions usually flow away from OPEN (grace polls and insufficient-funds
    // recovery can flip an order back), so keep the non-OPEN copy -- worst case it is one
    // TTL stale for an order that just re-opened.
    const byHash = new Map<string, T>()
    for (const order of results.flatMap((r) => r.orders)) {
      const existing = byHash.get(order.orderHash)
      if (!existing || existing.orderStatus === ORDER_STATUS.OPEN) {
        byHash.set(order.orderHash, order)
      }
    }

    const allOrders = [...byHash.values()]
    // Sort by createdAt descending (consistent with default query behavior)
    allOrders.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

    return {
      orders: allOrders.slice(0, effectiveLimit),
    }
  }

  private async queryOrderEntity(
    partitionKey: string | number,
    index: string,
    limit: number | undefined,
    cursor?: string,
    sortKey?: SORT_FIELDS | undefined,
    sort?: string | undefined, // ex gt(123)
    desc = true,
    filters: QueryFilter[] = []
  ): Promise<QueryResult<T>> {
    const formattedIndex = `${index}-${sortKey ?? TABLE_KEY.CREATED_AT}-all`
    const effectiveLimit = limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS

    // Gated on `enabled` so the GET_ORDERS_CACHE_TTL_MS=0 kill switch also silences the
    // cache metrics -- a disabled cache reporting a 100% miss rate is indistinguishable
    // from a broken one on a dashboard.
    const cache = this.queryCache?.enabled ? this.queryCache : undefined
    if (cache) {
      if (isCacheableQuery(index, cursor, sortKey)) {
        return this.queryThroughCache(cache, partitionKey, index, formattedIndex, effectiveLimit, filters)
      }
      metrics.putMetric(`${cache.metricPrefix}Uncacheable`, 1, Unit.Count)
    }

    let comparison: ComparisonFilter | undefined = undefined
    if (sortKey) {
      comparison = parseComparisonFilter(sort)
    }
    const queryResult = await this.entity.query(partitionKey, {
      filters: filters,
      index: formattedIndex,
      execute: true,
      limit: effectiveLimit,
      // Newest first unless a caller explicitly asks otherwise. DynamoDB's own default is
      // ascending, which would hand a poller the oldest page of a busy partition.
      reverse: desc,
      ...(sortKey &&
        comparison && {
          [comparison.operator]: comparison.operator == 'between' ? comparison.values : comparison.values[0],
        }),
      ...(cursor && { startKey: this.getStartKey(cursor, formattedIndex) }),
    })

    return {
      orders: queryResult.Items as T[],
      ...(queryResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(queryResult.LastEvaluatedKey)) }),
    }
  }

  /**
   * One cache entry per partition. The DynamoDB read ignores the caller's limit and type
   * filter and fetches the newest CACHED_QUERY_PAGE_SIZE rows; each request then filters and
   * slices that page in memory. Fillers asking for 10 or 50 orders, or for Dutch_V2 versus
   * Priority, all collapse onto the same read -- which is what keeps the key count, and so
   * the per-partition read rate, independent of how varied the polling traffic is.
   *
   * A server-side FilterExpression would cost the same RCUs (DynamoDB bills for rows
   * evaluated, not rows returned), so filtering here loses nothing.
   */
  private async queryThroughCache(
    cache: OrdersQueryCache,
    partitionKey: string | number,
    index: string,
    formattedIndex: string,
    effectiveLimit: number,
    filters: QueryFilter[]
  ): Promise<QueryResult<T>> {
    const cacheKey = JSON.stringify([this.table.name, formattedIndex, partitionKey])
    let page: CachedQueryPage | undefined = cache.get(cacheKey, Date.now())

    if (page) {
      metrics.putMetric(`${cache.metricPrefix}Hit`, 1, Unit.Count)
    } else {
      metrics.putMetric(`${cache.metricPrefix}Miss`, 1, Unit.Count)
      const queryResult = await this.entity.query(partitionKey, {
        index: formattedIndex,
        execute: true,
        limit: CACHED_QUERY_PAGE_SIZE,
        reverse: true,
      })
      page = { orders: queryResult.Items as T[], lastEvaluatedKey: queryResult.LastEvaluatedKey }

      // Stamped after the round trip, not before it. A throttled partition retries with
      // backoff, so a query can outlast the TTL -- dating the entry from the query start
      // would write it already expired, exactly when the cache is most needed.
      const capacityEvictions = cache.set(cacheKey, page, Date.now())
      if (capacityEvictions > 0) {
        metrics.putMetric(`${cache.metricPrefix}CapacityEviction`, capacityEvictions, Unit.Count)
      }
      // Every miss is a DynamoDB read against this partition. Logged with its key so the
      // distinct-key count and the heaviest partitions can be read off Logs Insights, e.g.
      //   filter msg = "Query cache miss" | stats count(*) by partitionKey | sort desc
      this.log.info(
        {
          table: this.table.name,
          index: formattedIndex,
          partitionKey,
          rows: page.orders.length,
          truncated: page.lastEvaluatedKey !== undefined,
          cacheSize: cache.size,
        },
        'Query cache miss'
      )
    }
    // Live distinct keys in this execution environment. Read the Max statistic.
    metrics.putMetric(`${cache.metricPrefix}Size`, cache.size, Unit.Count)

    const orders = page.orders as T[]
    const matching = filters.length ? orders.filter((order) => matchesAnyFilter(order, filters)) : orders
    // A fresh array: callers may push or splice without reaching the cached page. The order
    // objects themselves are shared and must be treated as read-only.
    const returned = matching.slice(0, effectiveLimit)

    // Pagination still works from a cached page. The cursor names the last row handed back
    // (or DynamoDB's own continuation key when nothing matched), and following it reads
    // DynamoDB directly -- a cursor query never touches the cache. GET /orders drops the
    // cursor from its response; GET /limit-orders passes it on.
    const hasMore = matching.length > returned.length || page.lastEvaluatedKey !== undefined
    if (!hasMore) {
      return { orders: returned }
    }
    const last = returned[returned.length - 1] as Record<string, unknown> | undefined
    const nextKey = last
      ? { [TABLE_KEY.ORDER_HASH]: last.orderHash, [index]: last[index], [TABLE_KEY.CREATED_AT]: last.createdAt }
      : page.lastEvaluatedKey
    return { orders: returned, cursor: encode(JSON.stringify(nextKey)) }
  }

  private getRequestedParams(queryFilters: GetOrdersQueryParams) {
    return Object.keys(queryFilters).filter((requestedParam) => {
      return ![GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT, GET_QUERY_PARAMS.DESC].includes(
        requestedParam as GET_QUERY_PARAMS
      )
    })
  }

  private getStartKey(cursor: string, index?: string) {
    let lastEvaluatedKey = []
    try {
      lastEvaluatedKey = JSON.parse(decode(cursor))
    } catch (e) {
      this.log.error('Error parsing json cursor.', { cursor, error: e })
      throw new Error('Invalid cursor.')
    }
    const keys = Object.keys(lastEvaluatedKey)
    const validKeys: string[] = [TABLE_KEY.ORDER_HASH]

    index
      ?.split('-')
      .filter((key) => Object.values<string>(TABLE_KEY).includes(key))
      .forEach((key: string) => {
        if (key) {
          validKeys.push(key)
        }
      })

    const keysMatch = keys.every((key: string) => {
      return validKeys.includes(key as TABLE_KEY)
    })

    if (keys.length != validKeys.length || !keysMatch) {
      this.log.error('Error cursor key not in valid key list.', { cursor })
      throw new Error('Invalid cursor.')
    }

    return lastEvaluatedKey
  }
}
