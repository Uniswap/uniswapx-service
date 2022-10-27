import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { OrderEntity, TABLE_KEY } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private readonly ordersTable: Table
  private readonly orderEntity: any

  constructor(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        offererIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.CREATED_AT },
        orderStatusIndex: { partitionKey: TABLE_KEY.ORDER_STATUS, sortKey: TABLE_KEY.CREATED_AT },
        sellTokenIndex: { partitionKey: TABLE_KEY.SELL_TOKEN, sortKey: TABLE_KEY.CREATED_AT },
        offererOrderStatusIndex: { partitionKey: TABLE_KEY.OFFERER_ORDER_STATUS, sortKey: TABLE_KEY.SELL_TOKEN },
        offererSellTokenIndex: { partitionKey: TABLE_KEY.OFFERER_SELL_TOKEN },
        sellTokenOrderStatusIndex: { partitionKey: TABLE_KEY.SELL_TOKEN_ORDER_STATUS },
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
        createdAt: { type: DYNAMODB_TYPES.NUMBER, required: true },
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        offerer: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
      },
      table: this.ordersTable,
    } as const)
  }

  public async getByHash(hash: string): Promise<OrderEntity[]> {
    const order = await this.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash })
    return [order.Item]
  }

  public async getByOfferer(offerer: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(offerer, 'offererIndex', limit)
  }

  public async getByOrderStatus(orderStatus: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(orderStatus, 'orderStatusIndex', limit)
  }

  public async getBySellToken(sellToken: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(sellToken, 'sellTokenIndex', limit)
  }

  public async put(_order: OrderEntity): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, _log?: Logger): Promise<OrderEntity[]> {
    const requestedParams = Object.keys(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_HASH], requestedParams):
        return await this.getByHash(queryFilters['orderHash'] as string)

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return await this.getByOfferer(queryFilters['offerer'] as string, limit)

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.getByOrderStatus(queryFilters['orderStatus'] as string, limit)

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.getBySellToken(queryFilters['sellToken'] as string, limit)

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          'offererOrderStatusIndex',
          limit,
          queryFilters['sellToken']
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          'offererOrderStatusIndex',
          limit
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['offerer']}-${queryFilters['sellToken']}`,
          'offererSellTokenIndex',
          limit
        )

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return await this.queryOrderEntity(
          `${queryFilters['sellToken']}-${queryFilters['orderStatus']}`,
          'sellTokenOrderStatusIndex',
          limit
        )

      default:
        const getOrdersScan = await this.ordersTable
          .scan({
            ...(limit && { limit: limit }),
          })
        return getOrdersScan.Items
    }
  }

  private async queryOrderEntity(
    partitionKey: string,
    index: string,
    limit: number | undefined,
    sortKey?: string
  ): Promise<OrderEntity[]> {
    const queryResult = await this.orderEntity.query(partitionKey, {
      index: index,
      ...(limit && { limit: limit }),
      ...(sortKey && { eq: sortKey }),
    })
    return queryResult.Items
  }

  private areParamsRequested(queryParams: GET_QUERY_PARAMS[], requestedParams: string[]): boolean {
    return (
      requestedParams.length == queryParams.length && queryParams.every((filter) => requestedParams.includes(filter))
    )
  }
}
