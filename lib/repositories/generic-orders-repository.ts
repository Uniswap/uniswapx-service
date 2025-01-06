import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { TABLE_KEY } from '../config/dynamodb'
import { ORDER_STATUS, SettledAmount, SORT_FIELDS } from '../entities'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { log } from '../Logging'
import { checkDefined } from '../preconditions/preconditions'
import { ComparisonFilter, parseComparisonFilter } from '../util/comparison'
import { decode, encode } from '../util/encryption'
import { generateRandomNonce } from '../util/nonce'
import { currentTimestampInSeconds } from '../util/time'
import { BaseOrdersRepository, OrderEntityType, QueryResult } from './base'
import { IndexMapper } from './IndexMappers/IndexMapper'

export const MAX_ORDERS = 50
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
    private readonly indexMapper: IndexMapper<T>
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

      await this.entity.update({
        [TABLE_KEY.ORDER_HASH]: orderHash,
        ...this.indexMapper.getIndexFieldsForStatusUpdate(order, status),
        ...(txHash && { txHash }),
        ...(fillBlock && { fillBlock }),
        ...(settledAmounts && { settledAmounts })
      })
    } catch (e) {
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
          'Invalid query, must query with one of the following params: [orderHash, orderHashes, chainId, orderStatus, swapper, filler]'
        )
      }
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

    const queryResult = await this.entity.query(partitionKey, {
      filters: filters,
      index: formattedIndex,
      execute: true,
      limit: limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS,
      ...(sortKey &&
        comparison && {
          [comparison.operator]: comparison.operator == 'between' ? comparison.values : comparison.values[0],
          reverse: desc,
        }),
      ...(cursor && { startKey: this.getStartKey(cursor, formattedIndex) }),
    })

    return {
      orders: queryResult.Items as T[],
      ...(queryResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(queryResult.LastEvaluatedKey)) }),
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
