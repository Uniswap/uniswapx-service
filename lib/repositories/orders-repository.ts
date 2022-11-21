import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { getValidKeys, OrderEntity, ORDER_STATUS } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { checkDefined } from '../preconditions/preconditions'
import { decode, encode } from '../util/encryption'
import { generateRandomNonce } from '../util/nonce'
import { getCurrentTime } from '../util/time'
import { BaseOrdersRepository, QueryResult } from './base'

export const MAX_ORDERS = 500

export class DynamoOrdersRepository implements BaseOrdersRepository {
  static create(documentClient: DocumentClient): BaseOrdersRepository {
    const ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        offererIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.CREATED_AT },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
        orderStatusIndex: { partitionKey: TABLE_KEY.ORDER_STATUS, sortKey: TABLE_KEY.CREATED_AT },
        sellTokenIndex: { partitionKey: TABLE_KEY.SELL_TOKEN, sortKey: TABLE_KEY.CREATED_AT },
        offererOrderStatusIndex: { partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS, sortKey: TABLE_KEY.SELL_TOKEN },
        offererSellTokenIndex: { partitionKey: TABLE_KEY.OFFERER_SELL_TOKEN },
        sellTokenOrderStatusIndex: { partitionKey: TABLE_KEY.SELL_TOKEN_ORDER_STATUS },
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
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        createdAt: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
        offererOrderStatus: { type: DYNAMODB_TYPES.STRING },
        offererSellToken: { type: DYNAMODB_TYPES.STRING },
        sellTokenOrderStatus: { type: DYNAMODB_TYPES.STRING },
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

  public async getByOfferer(offerer: string, limit: number, cursor?: string): Promise<QueryResult> {
    return await this.queryOrderEntity(offerer, 'offererIndex', limit, cursor)
  }

  public async getByOrderStatus(orderStatus: string, limit: number, cursor?: string): Promise<QueryResult> {
    return await this.queryOrderEntity(orderStatus, 'orderStatusIndex', limit, cursor)
  }

  public async getBySellToken(sellToken: string, limit: number, cursor?: string): Promise<QueryResult> {
    return await this.queryOrderEntity(sellToken, 'sellTokenIndex', limit, cursor)
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
    const res = await this.orderEntity.query(`${offerer}-${orderStatus}`, {
      index: 'offererOrderStatusIndex',
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
          createdAt: getCurrentTime(),
          offererOrderStatus: `${order.offerer}-${order.orderStatus}`,
          offererSellToken: `${order.offerer}-${order.sellToken}`,
          sellTokenOrderStatus: `${order.sellToken}-${order.orderStatus}`,
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
      offererOrderStatus: `${order.offerer}-${status}`,
      sellTokenOrderStatus: `${order.sellToken}-${status}`,
    })
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, cursor?: string): Promise<QueryResult> {
    const requestedParams = Object.keys(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return { orders: order ? [order] : [] }
      }

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.getByOfferer(queryFilters['offerer'] as string, limit, cursor)

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.getByOrderStatus(queryFilters['orderStatus'] as string, limit, cursor)

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.getBySellToken(queryFilters['sellToken'] as string, limit, cursor)

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          'offererOrderStatusIndex',
          limit,
          cursor,
          queryFilters['sellToken']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          'offererOrderStatusIndex',
          limit,
          cursor
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['sellToken']}`,
          'offererSellTokenIndex',
          limit,
          cursor
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['sellToken']}-${queryFilters['orderStatus']}`,
          'sellTokenOrderStatusIndex',
          limit,
          cursor
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
    partitionKey: string,
    index: string,
    limit: number | undefined,
    cursor?: string,
    sortKey?: string
  ): Promise<QueryResult> {
    const queryResult = await this.orderEntity.query(partitionKey, {
      index: index,
      execute: true,
      limit: limit ? Math.min(limit, MAX_ORDERS) : MAX_ORDERS,
      ...(sortKey && { eq: sortKey }),
      ...(cursor && { startKey: this.getStartKey(cursor, index) }),
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

  private getStartKey(cursor: string, index?: string) {
    let lastEvaluatedKey = []
    try {
      lastEvaluatedKey = JSON.parse(decode(cursor))
    } catch (e) {
      throw new Error('Invalid cursor.')
    }
    const keys = Object.keys(lastEvaluatedKey)
    const validKeys = getValidKeys(index)
    const keysMatch = keys.every((key: string) => {
      return validKeys.includes(key as TABLE_KEY)
    })

    if (keys.length != validKeys.length || !keysMatch) {
      throw new Error('Invalid cursor.')
    }

    return lastEvaluatedKey
  }
}
