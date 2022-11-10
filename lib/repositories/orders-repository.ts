import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity, SORT_FIELDS } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { parseComparisonFilter } from '../util/comparison'
import { generateRandomNonce } from '../util/nonce'
import { getCurrentMonth } from '../util/time'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private static ordersTable: Table
  private static nonceTable: Table
  private static orderEntity: Entity<{}>
  private static nonceEntity: Entity<{}>

  static initialize(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER_SELL_TOKEN}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_SELL_TOKEN,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN_ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.CREATED_AT}-index`]: {
          partitionKey: TABLE_KEY.CREATED_AT_MONTH,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER_ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER_SELL_TOKEN}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.OFFERER_SELL_TOKEN,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN_ORDER_STATUS,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.DEADLINE}-index`]: {
          partitionKey: TABLE_KEY.CREATED_AT_MONTH,
          sortKey: TABLE_KEY.DEADLINE,
        },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
      },
    })

    this.orderEntity = new Entity({
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
        offererOrderStatusSellToken: { type: DYNAMODB_TYPES.STRING },
        createdAtMonth: { type: DYNAMODB_TYPES.NUMBER },
      },
      table: this.ordersTable,
    } as const)

    this.nonceTable = new Table({
      name: 'Nonces',
      partitionKey: 'offerer',
      DocumentClient: documentClient,
    })

    this.nonceEntity = new Entity({
      name: 'Nonce',
      attributes: {
        offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
      },
      table: this.nonceTable,
    } as const)
  }

  public async getByOfferer(
    offerer: string,
    limit: number,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(offerer, `${TABLE_KEY.OFFERER}`, limit, sortKey, sort)
  }

  public async getByOrderStatus(
    orderStatus: string,
    limit: number,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(orderStatus, `${TABLE_KEY.ORDER_STATUS}`, limit, sortKey, sort)
  }

  public async getBySellToken(
    sellToken: string,
    limit: number,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(sellToken, `${TABLE_KEY.SELL_TOKEN}`, limit, sortKey, sort)
  }

  public async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await DynamoOrdersRepository.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash })
    return res.Item as OrderEntity
  }

  public async getNonceByAddress(address: string): Promise<string> {
    const res = await DynamoOrdersRepository.nonceEntity.query(address, {
      limit: 1,
      reverse: true,
      consistent: true,
    })
    return res.Items.length > 0 ? res.Items[0].nonce : generateRandomNonce()
  }

  public async putOrderAndUpdateNonceTransaction(order: OrderEntity): Promise<void> {
    await DynamoOrdersRepository.ordersTable.transactWrite(
      [
        DynamoOrdersRepository.orderEntity.putTransaction({
          ...order,
          offererOrderStatus: `${order.offerer}-${order.orderStatus}`,
          offererSellToken: `${order.offerer}-${order.sellToken}`,
          sellTokenOrderStatus: `${order.sellToken}-${order.orderStatus}`,
          offererOrderStatusSellToken: `${order.offerer}-${order.orderStatus}-${order.sellToken}`,
        }),
        DynamoOrdersRepository.nonceEntity.updateTransaction({
          offerer: order.offerer,
          nonce: order.nonce,
        }),
      ],
      {
        capacity: 'total',
      }
    )
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams): Promise<(OrderEntity | undefined)[]> {
    const requestedParams = this.getRequestedParams(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return order ? [order] : []
      }

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.getByOfferer(
          queryFilters['offerer'] as string,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.getByOrderStatus(
          queryFilters['orderStatus'] as string,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.getBySellToken(
          queryFilters['sellToken'] as string,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}-${queryFilters['sellToken']}`,
          `${TABLE_KEY.OFFERER_ORDER_STATUS_SELL_TOKEN}`,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          `${TABLE_KEY.OFFERER_ORDER_STATUS}`,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['sellToken']}`,
          `${TABLE_KEY.OFFERER_SELL_TOKEN}`,
          limit,
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['sellToken']}-${queryFilters['orderStatus']}`,
          `${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}`,
          limit,
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
          queryFilters['sortKey'],
          queryFilters['sort']
        )

      default: {
        const getOrdersScan = await DynamoOrdersRepository.ordersTable.scan({
          ...(limit && { limit: limit }),
        })
        return getOrdersScan.Items
      }
    }
  }

  private async queryOrderEntity(
    partitionKey: string | number,
    index: string,
    limit: number | undefined,
    sortKey: SORT_FIELDS | undefined,
    sort: string | undefined
  ): Promise<OrderEntity[]> {
    let comparison = undefined
    if (sortKey) {
      comparison = parseComparisonFilter(sort)
    }

    const params = {
      index: `${index}-${sortKey ?? TABLE_KEY.CREATED_AT}-index`,
      ...(limit && { limit: limit }),
      ...(sortKey &&
        comparison && {
          [comparison.operator]: comparison.operator == 'between' ? comparison.values : comparison.values[0],
        }),
    }

    const queryResult = await DynamoOrdersRepository.orderEntity.query(partitionKey, params)

    return queryResult.Items
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
}
