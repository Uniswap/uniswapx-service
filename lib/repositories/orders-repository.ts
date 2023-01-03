import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity, ORDER_STATUS, SORT_FIELDS } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { checkDefined } from '../preconditions/preconditions'
import { parseComparisonFilter } from '../util/comparison'
import { decode, encode } from '../util/encryption'
import { generateRandomNonce } from '../util/nonce'
import { getCurrentMonth, getCurrentTime } from '../util/time'
import { BaseOrdersRepository, QueryResult } from './base'

export const MAX_ORDERS = 500

export class DynamoOrdersRepository implements BaseOrdersRepository {
  static create(documentClient: DocumentClient): BaseOrdersRepository {
    const ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.FILLER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.CREATED_AT_MONTH,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
      },
    })

    const orderEntity = new Entity({
      name: 'Order',
      attributes: {
        orderHash: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        encodedOrder: { type: DYNAMODB_TYPES.STRING, required: true },
        signature: { type: DYNAMODB_TYPES.STRING, required: true },
        orderStatus: { type: DYNAMODB_TYPES.STRING, required: true },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
        offerer: { type: DYNAMODB_TYPES.STRING, required: true },
        filler: { type: DYNAMODB_TYPES.STRING },
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        createdAt: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
        offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_offerer: { type: DYNAMODB_TYPES.STRING },
        filler_offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        createdAtMonth: { type: DYNAMODB_TYPES.NUMBER },
        quoteId: { type: DYNAMODB_TYPES.STRING },
      },
      table: ordersTable,
    } as const)

    const nonceTable = new Table({
      name: 'Nonces',
      partitionKey: 'offerer',
      DocumentClient: documentClient,
    })

    const nonceEntity = new Entity({
      name: 'Nonce',
      attributes: {
        offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
      },
      table: nonceTable,
    } as const)

    return new DynamoOrdersRepository(ordersTable, orderEntity, nonceEntity)
  }

  private constructor(
    private readonly ordersTable: Table<'Orders', 'orderHash', null>,
    private readonly orderEntity: Entity,
    private readonly nonceEntity: Entity
  ) {}

  public async getByOfferer(
    offerer: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(offerer, TABLE_KEY.OFFERER, limit, cursor, sortKey, sort)
  }

  public async getByOrderStatus(
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(orderStatus, TABLE_KEY.ORDER_STATUS, limit, cursor, sortKey, sort)
  }

  public async getByFiller(
    filler: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(filler, TABLE_KEY.FILLER, limit, cursor, sortKey, sort)
  }

  public async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await this.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash }, { execute: true })
    return res.Item as OrderEntity
  }

  public async getNonceByAddress(address: string): Promise<string> {
    const res = await this.nonceEntity.query(address, {
      limit: 1,
      reverse: true,
      consistent: true,
      execute: true,
    })
    return res.Items && res.Items.length > 0 ? res.Items[0].nonce : generateRandomNonce()
  }

  public async countOrdersByOffererAndStatus(offerer: string, orderStatus: ORDER_STATUS): Promise<number> {
    const res = await this.orderEntity.query(`${offerer}_${orderStatus}`, {
      index: 'offerer_orderStatus-createdAt',
      execute: true,
      select: 'COUNT',
    })

    return res.Count || 0
  }

  public async putOrderAndUpdateNonceTransaction(order: OrderEntity): Promise<void> {
    await this.ordersTable.transactWrite(
      [
        this.orderEntity.putTransaction({
          ...order,
          offerer_orderStatus: `${order.offerer}_${order.orderStatus}`,
          filler_orderStatus: `${order.filler}_${order.orderStatus}`,
          filler_offerer: `${order.filler}_${order.offerer}`,
          filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${order.orderStatus}`,
          createdAtMonth: getCurrentMonth(),
          createdAt: getCurrentTime(),
        }),
        this.nonceEntity.updateTransaction({
          offerer: order.offerer,
          nonce: order.nonce,
        }),
      ],
      {
        capacity: 'total',
      }
    )
  }

  public async updateOrderStatus(orderHash: string, status: ORDER_STATUS): Promise<void> {
    const order = checkDefined(await this.getByHash(orderHash), 'cannot find order by hash when updating order status')

    await this.orderEntity.update({
      [TABLE_KEY.ORDER_HASH]: orderHash,
      orderStatus: status,
      offerer_orderStatus: `${order.offerer}_${status}`,
      filler_orderStatus: `${order.filler}_${status}`,
      filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${status}`,
    })
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, cursor?: string): Promise<QueryResult> {
    const requestedParams = this.getRequestedParams(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return { orders: order ? [order] : [] }
      }

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.getByOfferer(
          queryFilters['offerer'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.getByOrderStatus(
          queryFilters['orderStatus'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER], requestedParams):
        return await this.getByFiller(
          queryFilters['filler'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['filler']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['filler']}_${queryFilters['offerer']}`,
          `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        return await this.queryOrderEntity(
          `${queryFilters['filler']}_${queryFilters['offerer']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case requestedParams.length == 0 && !!queryFilters['sortKey'] && !!queryFilters['sort']:
        return await this.queryOrderEntity(
          // TODO: This won't work well if it is the first of the month.
          // We should make two queries so we can capture the last 30 days of orders.
          getCurrentMonth(),
          `${TABLE_KEY.CREATED_AT_MONTH}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      default: {
        const scanResult = await this.ordersTable.scan({
          limit: limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS,
          execute: true,
          ...(cursor && { startKey: this.getStartKey(cursor) }),
        })

        return {
          orders: scanResult.Items as OrderEntity[],
          ...(scanResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(scanResult.LastEvaluatedKey)) }),
        }
      }
    }
  }

  private async queryOrderEntity(
    partitionKey: string | number,
    index: string,
    limit: number | undefined,
    cursor?: string,
    sortKey?: SORT_FIELDS | undefined,
    sort?: string | undefined
  ): Promise<QueryResult> {
    let comparison = undefined
    if (sortKey) {
      comparison = parseComparisonFilter(sort)
    }
    const formattedIndex = `${index}-${sortKey ?? TABLE_KEY.CREATED_AT}`

    const queryResult = await this.orderEntity.query(partitionKey, {
      index: formattedIndex,
      execute: true,
      limit: limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS,
      ...(sortKey &&
        comparison && {
          [comparison.operator]: comparison.operator == 'between' ? comparison.values : comparison.values[0],
        }),
      ...(cursor && { startKey: this.getStartKey(cursor, formattedIndex) }),
    })

    return {
      orders: queryResult.Items as OrderEntity[],
      ...(queryResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(queryResult.LastEvaluatedKey)) }),
    }
  }

  private areParamsRequested(queryParams: GET_QUERY_PARAMS[], requestedParams: string[]): boolean {
    return (
      requestedParams.length == queryParams.length && queryParams.every((filter) => requestedParams.includes(filter))
    )
  }

  private getRequestedParams(queryFilters: GetOrdersQueryParams) {
    return Object.keys(queryFilters).filter((requestedParam) => {
      return ![GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT].includes(requestedParam as GET_QUERY_PARAMS)
    })
  }

  private getStartKey(cursor: string, index?: string) {
    let lastEvaluatedKey = []
    try {
      lastEvaluatedKey = JSON.parse(decode(cursor))
    } catch (e) {
      throw new Error('Invalid cursor.')
    }
    const keys = Object.keys(lastEvaluatedKey)
    const validKeys: string[] = [TABLE_KEY.ORDER_HASH]

    index?.split('-').forEach((key: string) => {
      if (key) {
        validKeys.push(key)
      }
    })

    const keysMatch = keys.every((key: string) => {
      return validKeys.includes(key as TABLE_KEY)
    })

    if (keys.length != validKeys.length || !keysMatch) {
      throw new Error('Invalid cursor.')
    }

    return lastEvaluatedKey
  }
}
