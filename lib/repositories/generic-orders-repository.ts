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
import { OrdersQueryCache } from './QueryCache'

export const MAX_ORDERS = 50

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
    filters: { or: boolean; attr: string; eq: string }[] = []
  ): Promise<QueryResult<T>> {
    let comparison: ComparisonFilter | undefined = undefined
    if (sortKey) {
      comparison = parseComparisonFilter(sort)
    }
    const formattedIndex = `${index}-${sortKey ?? TABLE_KEY.CREATED_AT}-all`
    const effectiveLimit = limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS

    // Gated on `enabled` so the GET_ORDERS_CACHE_TTL_MS=0 kill switch also silences the
    // hit/miss metrics -- a disabled cache reporting a 100% miss rate is indistinguishable
    // from a broken one on a dashboard.
    const cache = this.queryCache?.enabled ? this.queryCache : undefined
    let cacheKey: string | undefined
    if (cache) {
      // Every input that can change the result set is part of the key, so a hit is always
      // the page the caller would have read anyway -- just up to the cache TTL stale.
      cacheKey = JSON.stringify([
        this.table.name,
        formattedIndex,
        partitionKey,
        effectiveLimit,
        cursor ?? null,
        sortKey ?? null,
        sort ?? null,
        desc,
        filters,
      ])
      const cached = cache.get(cacheKey, Date.now())
      if (cached) {
        metrics.putMetric(`${cache.metricPrefix}Hit`, 1, Unit.Count)
        return this.copyQueryResult(cached as QueryResult<T>)
      }
      metrics.putMetric(`${cache.metricPrefix}Miss`, 1, Unit.Count)
    }

    const queryResult = await this.entity.query(partitionKey, {
      filters: filters,
      index: formattedIndex,
      execute: true,
      limit: effectiveLimit,
      ...(sortKey &&
        comparison && {
          [comparison.operator]: comparison.operator == 'between' ? comparison.values : comparison.values[0],
          reverse: desc,
        }),
      ...(cursor && { startKey: this.getStartKey(cursor, formattedIndex) }),
    })

    const result: QueryResult<T> = {
      orders: queryResult.Items as T[],
      ...(queryResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(queryResult.LastEvaluatedKey)) }),
    }

    if (cache && cacheKey) {
      // Stamped after the round trip, not before it. A throttled partition retries with
      // backoff, so a query can outlast the TTL -- dating the entry from the query start
      // would write it already expired, exactly when the cache is most needed.
      cache.set(cacheKey, result as QueryResult<OrderEntityType>, Date.now())
    }
    return this.copyQueryResult(result)
  }

  // Shallow: callers get their own array, so pushing or splicing cannot reach a cached
  // entry. The order objects themselves are shared and must be treated as read-only --
  // mutating one in place would poison every hit for the rest of the TTL.
  private copyQueryResult(result: QueryResult<T>): QueryResult<T> {
    return {
      orders: [...(result.orders ?? [])],
      ...(result.cursor && { cursor: result.cursor }),
    }
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
