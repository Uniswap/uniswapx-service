import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity, ORDER_STATUS, SettledAmount, SORT_FIELDS } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { checkDefined } from '../preconditions/preconditions'
import { parseComparisonFilter } from '../util/comparison'
import { decode, encode } from '../util/encryption'
import { generateRandomNonce } from '../util/nonce'
import { currentTimestampInSeconds } from '../util/time'
import { BaseOrdersRepository, QueryResult } from './base'

export const MAX_ORDERS = 50

export class DynamoOrdersRepository implements BaseOrdersRepository {
  static log: Logger

  static create(documentClient: DocumentClient): BaseOrdersRepository {
    this.log = Logger.createLogger({
      name: 'DynamoOrdersRepository',
      serializers: Logger.stdSerializers,
    })

    const ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.FILLER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.CHAIN_ID,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
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
        decayStartTime: { type: DYNAMODB_TYPES.NUMBER },
        decayEndTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        createdAt: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        type: { type: DYNAMODB_TYPES.STRING },
        chainId: { type: DYNAMODB_TYPES.NUMBER },
        input: { type: DYNAMODB_TYPES.MAP },
        outputs: { type: DYNAMODB_TYPES.LIST },
        offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_orderStatus: { type: DYNAMODB_TYPES.STRING },
        filler_offerer: { type: DYNAMODB_TYPES.STRING },
        chainId_filler: { type: DYNAMODB_TYPES.STRING },
        chainId_orderStatus: { type: DYNAMODB_TYPES.STRING },
        chainId_orderStatus_filler: { type: DYNAMODB_TYPES.STRING },
        filler_offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        quoteId: { type: DYNAMODB_TYPES.STRING },
        txHash: { type: DYNAMODB_TYPES.STRING },
        settledAmounts: { type: DYNAMODB_TYPES.LIST },
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
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(offerer, TABLE_KEY.OFFERER, limit, cursor, sortKey, sort, desc)
  }

  public async getByOrderStatus(
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(orderStatus, TABLE_KEY.ORDER_STATUS, limit, cursor, sortKey, sort, desc)
  }

  public async getByFiller(
    filler: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(filler, TABLE_KEY.FILLER, limit, cursor, sortKey, sort, desc)
  }

  public async getByChainId(
    chainId: number,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string,
    desc?: boolean
  ): Promise<QueryResult> {
    return await this.queryOrderEntity(chainId, TABLE_KEY.CHAIN_ID, limit, cursor, sortKey, sort, desc)
  }

  public async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await this.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash }, { execute: true })
    return res.Item as OrderEntity
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
    const res = await this.orderEntity.query(`${offerer}_${orderStatus}`, {
      index: 'offerer_orderStatus-createdAt-all',
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
          chainId_filler: `${order.chainId}_${order.filler}`,
          chainId_orderStatus: `${order.chainId}_${order.orderStatus}`,
          chainId_orderStatus_filler: `${order.chainId}_${order.orderStatus}_${order.filler}`,
          filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${order.orderStatus}`,
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
    settledAmounts?: SettledAmount[]
  ): Promise<void> {
    const order = checkDefined(await this.getByHash(orderHash), 'cannot find order by hash when updating order status')

    await this.orderEntity.update({
      [TABLE_KEY.ORDER_HASH]: orderHash,
      orderStatus: status,
      offerer_orderStatus: `${order.offerer}_${status}`,
      filler_orderStatus: `${order.filler}_${status}`,
      filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${status}`,
      chainId_orderStatus: `${order.chainId}_${status}`,
      chainId_orderStatus_filler: `${order.chainId}_${status}_${order.filler}`,
      ...(txHash && { txHash }),
      ...(settledAmounts && { settledAmounts }),
    })
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, cursor?: string): Promise<QueryResult> {
    const requestedParams = this.getRequestedParams(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
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
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.FILLER], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['chainId']}_${queryFilters['filler']}`,
          `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['chainId']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.ORDER_STATUS, GET_QUERY_PARAMS.FILLER],
        requestedParams
      ):
        return await this.queryOrderEntity(
          `${queryFilters['chainId']}_${queryFilters['orderStatus']}_${queryFilters['filler']}`,
          `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['filler']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['filler']}_${queryFilters['offerer']}`,
          `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}_${queryFilters['orderStatus']}`,
          `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return { orders: order ? [order] : [] }
      }

      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASHES): {
        const orderHashes = queryFilters['orderHashes'] as string[]
        const batchQuery = await this.ordersTable.batchGet(
          orderHashes.map((orderHash) => this.orderEntity.getBatch({ orderHash })),
          { execute: true }
        )
        return { orders: batchQuery.Responses.Orders }
      }

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.getByOfferer(
          queryFilters['offerer'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.getByOrderStatus(
          queryFilters['orderStatus'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER], requestedParams):
        return await this.getByFiller(
          queryFilters['filler'] as string,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID], requestedParams):
        return await this.getByChainId(
          queryFilters['chainId'] as number,
          limit,
          cursor,
          queryFilters['sortKey'],
          queryFilters['sort'],
          queryFilters['desc']
        )

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
    sort?: string | undefined,
    desc = true
  ): Promise<QueryResult> {
    let comparison = undefined
    if (sortKey) {
      comparison = parseComparisonFilter(sort)
    }
    const formattedIndex = `${index}-${sortKey ?? TABLE_KEY.CREATED_AT}-all`

    const queryResult = await this.orderEntity.query(partitionKey, {
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
      throw new Error('Invalid cursor.')
    }

    return lastEvaluatedKey
  }
}
