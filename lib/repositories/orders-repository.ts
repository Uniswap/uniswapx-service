import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity, ORDER_STATUS } from '../entities/Order'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { checkDefined } from '../preconditions/preconditions'
import { generateRandomNonce } from '../util/nonce'
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
        offererIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.CREATED_AT },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
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
        offerer: { type: DYNAMODB_TYPES.STRING, required: true },
        startTime: { type: DYNAMODB_TYPES.NUMBER },
        endTime: { type: DYNAMODB_TYPES.NUMBER },
        deadline: { type: DYNAMODB_TYPES.NUMBER },
        reactor: { type: DYNAMODB_TYPES.STRING },
        sellToken: { type: DYNAMODB_TYPES.STRING },
        sellAmount: { type: DYNAMODB_TYPES.STRING },
        offererOrderStatus: { type: DYNAMODB_TYPES.STRING },
        offererSellToken: { type: DYNAMODB_TYPES.STRING },
        sellTokenOrderStatus: { type: DYNAMODB_TYPES.STRING },
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

  public async getByOfferer(offerer: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(offerer, 'offererIndex', limit)
  }

  public async getByOrderStatus(orderStatus: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(orderStatus, 'orderStatusIndex', limit)
  }

  public async getBySellToken(sellToken: string, limit: number): Promise<OrderEntity[]> {
    return await this.queryOrderEntity(sellToken, 'sellTokenIndex', limit)
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

  public async updateOrderStatus(orderHash: string, status: ORDER_STATUS): Promise<void> {
    const order = checkDefined(await this.getByHash(orderHash), 'cannot find order by hash when updating order status')

    await DynamoOrdersRepository.orderEntity.update({
      [TABLE_KEY.ORDER_HASH]: orderHash,
      orderStatus: status,
      offererOrderStatus: `${order.offerer}-${status}`,
      sellTokenOrderStatus: `${order.sellToken}-${status}`,
    })
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams): Promise<(OrderEntity | undefined)[]> {
    const requestedParams = Object.keys(queryFilters)

    // Query Orders table based on the requested params
    switch (true) {
      case requestedParams.includes(GET_QUERY_PARAMS.ORDER_HASH): {
        const order = await this.getByHash(queryFilters['orderHash'] as string)
        return order ? [order] : []
      }

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

      default: {
        const getOrdersScan = await DynamoOrdersRepository.ordersTable.scan({
          ...(limit && { limit: limit }),
        })
        return getOrdersScan.Items
      }
    }
  }

  private async queryOrderEntity(
    partitionKey: string,
    index: string,
    limit: number | undefined,
    sortKey?: string
  ): Promise<OrderEntity[]> {
    const queryResult = await DynamoOrdersRepository.orderEntity.query(partitionKey, {
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
