import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES, TABLE_KEY } from '../config/dynamodb'
import { OrderEntity, ORDER_STATUS, SORT_FIELDS } from '../entities/Order'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { checkDefined } from '../preconditions/preconditions'
import { parseComparisonFilter } from '../util/comparison'
import { decode, encode } from '../util/encryption'
import { generateRandomNonce } from '../util/nonce'
import { equal } from '../util/sets'
import { getCurrentMonth, getCurrentTime } from '../util/time'
import { BaseOrdersRepository, QueryResult } from './base'

export const MAX_ORDERS = 500

type INDEX = {
  name: string;
  fields: string[]
  // partitionKey: string;
  // sortKey?: string
}

const OFFERRER_CREATEDAT_INDEX: INDEX = {
  name: `${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}`,
  fields: [TABLE_KEY.OFFERER, TABLE_KEY.CREATED_AT]
};

const OFFERRER_DEADLINE_INDEX: INDEX = {
  name: `${TABLE_KEY.OFFERER}-${TABLE_KEY.DEADLINE}`,
  fields: [TABLE_KEY.OFFERER, TABLE_KEY.DEADLINE]
};

const OFFERER_STATUS__SELLTOKEN_CREATEDAT_INDEX = = {
  name: `${TABLE_KEY.OFFERER}-${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}`,
  fields: [TABLE_KEY.OFFERER, TABLE_KEY.ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT]
};

const OFFERER_STATUS__SELLTOKEN_DEADLINE_INDEX = = {
  name: `${TABLE_KEY.OFFERER}-${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}`,
  fields: [TABLE_KEY.OFFERER, TABLE_KEY.ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT]
};






export class DynamoOrdersRepository implements BaseOrdersRepository {
  private static ordersTable: Table<'Orders', 'orderHash', null>
  private static nonceTable: Table<'Nonces', 'offerer', null>
  private static orderEntity: Entity
  private static nonceEntity: Entity

  static initialize(documentClient: DocumentClient) {
    this.ordersTable = new Table({
      name: 'Orders',
      partitionKey: 'orderHash',
      DocumentClient: documentClient,
      indexes: {
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.SELL_TOKEN}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.SELL_TOKEN}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.SELL_TOKEN}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: `${TABLE_KEY.SELL_TOKEN}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.CREATED_AT}`]: {
          partitionKey: TABLE_KEY.CREATED_AT_MONTH,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: TABLE_KEY.SELL_TOKEN,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.SELL_TOKEN}`,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.SELL_TOKEN}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.SELL_TOKEN}`,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.SELL_TOKEN}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.DEADLINE}`]: {
          partitionKey: `${TABLE_KEY.SELL_TOKEN}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.DEADLINE,
        },
        [`${TABLE_KEY.CREATED_AT_MONTH}-${TABLE_KEY.DEADLINE}`]: {
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
        offerer_orderStatus: { type: DYNAMODB_TYPES.STRING },
        offerer_sellToken: { type: DYNAMODB_TYPES.STRING },
        sellToken_orderStatus: { type: DYNAMODB_TYPES.STRING },
        offerer_orderStatus_sellToken: { type: DYNAMODB_TYPES.STRING },
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
    sortKey: SORT_FIELDS,
    limit: number,
    cursor?: string,
    sort?: string
  ): Promise<QueryResult> {

    let index;
    if (sortKey == SORT_FIELDS.CREATED_AT) {
      index = OFFERRER_CREATEDAT_INDEX;
    } else if (sortKey == SORT_FIELDS.DEADLINE) {
      index = OFFERRER_DEADLINE_INDEX;
    } else {
      throw new Error("asdf");
    }

    return await this.queryOrderEntity(offerer, index, limit, cursor, sortKey, sort)
  }

  public async getByOrderStatus(
    orderStatus: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<QueryResult> {
    return null as any;
    // return await this.queryOrderEntity(orderStatus, TABLE_KEY.ORDER_STATUS, limit, cursor, sortKey, sort)
  }

  public async getBySellToken(
    sellToken: string,
    limit: number,
    cursor?: string,
    sortKey?: SORT_FIELDS,
    sort?: string
  ): Promise<QueryResult> {
    return null as any;
    // return await this.queryOrderEntity(sellToken, TABLE_KEY.SELL_TOKEN, limit, cursor, sortKey, sort)
  }

  public async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const res = await DynamoOrdersRepository.orderEntity.get({ [TABLE_KEY.ORDER_HASH]: hash }, { execute: true })
    return res.Item as OrderEntity
  }

  public async getNonceByAddress(address: string): Promise<string> {
    const res = await DynamoOrdersRepository.nonceEntity.query(address, {
      limit: 1,
      reverse: true,
      consistent: true,
      execute: true,
    })
    return res.Items && res.Items.length > 0 ? res.Items[0].nonce : generateRandomNonce()
  }

  public async putOrderAndUpdateNonceTransaction(order: OrderEntity): Promise<void> {
    await DynamoOrdersRepository.ordersTable.transactWrite(
      [
        DynamoOrdersRepository.orderEntity.putTransaction({
          ...order,
          offerer_orderStatus: `${order.offerer}_${order.orderStatus}`,
          offerer_sellToken: `${order.offerer}_${order.sellToken}`,
          sellToken_orderStatus: `${order.sellToken}_${order.orderStatus}`,
          offerer_orderStatus_sellToken: `${order.offerer}_${order.orderStatus}_${order.sellToken}`,
          createdAtMonth: getCurrentMonth(),
          createdAt: getCurrentTime(),
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
      offerer_orderStatus: `${order.offerer}_${status}`,
      sellToken_orderStatus: `${order.sellToken}_${status}`,
      offerer_orderStatus_sellToken: `${order.offerer}_${status}_${order.sellToken}`,
    })
  }

  public async getOrdersByOffererStatusSellTokenByCreationgDate(offerer: string, orderStatus: ORDER_STATUS, sellToken: string, limit: number, cursor?: string) {
    return await this.queryOrderEntity(`${offerer}_${orderStatus}_${sellToken}`, OFFERER_STATUS__SELLTOKEN_CREATEDAT_INDEX, limit, cursor);
  }

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, cursor?: string): Promise<QueryResult> {
    limit = Math.min(limit, MAX_ORDERS)

    // if (
    //   queryFilters.offerer != null &&
    //   queryFilters.sellToken != null &&
    //   queryFilters.orderStatus != null
    // ) {
    //   return await this.queryOrderEntity(
    //     `${queryFilters.offerer}_${queryFilters.orderStatus}_${queryFilters.sellToken}`,
    //     `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.SELL_TOKEN}`,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    // if (
    //   queryFilters.offerer != null &&

    //   queryFilters.orderStatus != null

    // ) {
    //   return await this.queryOrderEntity(
    //     `${queryFilters.offerer}_${queryFilters.orderStatus}`,
    //     `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    // if (
    //   queryFilters.offerer != null &&

    //   queryFilters.sellToken != null

    // ) {
    //   return await this.queryOrderEntity(
    //     `${queryFilters.offerer}_${queryFilters.sellToken}`,
    //     `${TABLE_KEY.OFFERER}_${TABLE_KEY.SELL_TOKEN}`,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    // if (
    //   queryFilters.orderStatus != null &&

    //   queryFilters.sellToken != null

    // ) {
    //   return await this.queryOrderEntity(
    //     `${queryFilters.sellToken}_${queryFilters.orderStatus}`,
    //     `${TABLE_KEY.SELL_TOKEN}_${TABLE_KEY.ORDER_STATUS}`,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    // if (queryFilters.offerer != null) {



    //   return await this.getByOfferer(queryFilters.offerer, limit, cursor, queryFilters.sortKey, queryFilters.sort)
    // }

    // if (queryFilters.orderStatus != null) {
    //   return await this.getByOrderStatus(
    //     queryFilters.orderStatus,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    // if (queryFilters.sellToken != null) {
    //   return await this.getBySellToken(queryFilters.sellToken, limit, cursor, queryFilters.sortKey, queryFilters.sort)
    // }

    // if (!!queryFilters.sortKey && !!queryFilters.sort) {
    //   return await this.queryOrderEntity(
    //     // TODO: This won't work well if it is the first of the month.
    //     // We should make two queries so we can capture the last 30 days of orders.
    //     getCurrentMonth(),
    //     `${TABLE_KEY.CREATED_AT_MONTH}`,
    //     limit,
    //     cursor,
    //     queryFilters.sortKey,
    //     queryFilters.sort
    //   )
    // }

    const scanResult = await DynamoOrdersRepository.ordersTable.scan({
      limit,
      execute: true,
      ...(cursor && { startKey: this.getStartKey(cursor) }),
    })

    return {
      orders: scanResult.Items as OrderEntity[],
      ...(scanResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(scanResult.LastEvaluatedKey)) }),
    }
  }

  private async queryOrderEntity(
    partitionKey: string | number,
    index: INDEX,
    limit: number,
    cursor?: string,
  ): Promise<QueryResult> {
    const queryResult = await DynamoOrdersRepository.orderEntity.query(partitionKey, {
      index: index.name,
      execute: true,
      limit,
      ...(cursor && { startKey: this.getStartKey(cursor, index) }),
    })

    return {
      orders: queryResult.Items as OrderEntity[],
      ...(queryResult.LastEvaluatedKey && { cursor: encode(JSON.stringify(queryResult.LastEvaluatedKey)) }),
    }
  }

  private getStartKey(cursor: string, index: INDEX) {
    let lastEvaluatedKey = []
    try {
      lastEvaluatedKey = JSON.parse(decode(cursor))
    } catch (e) {
      throw new Error('Invalid cursor.')
    }
    const keys = Object.keys(lastEvaluatedKey)

    if (!equal(new Set(keys), new Set(index.fields))) {
      throw new Error('Invalid/missing keys in cursor.');
    }

    return lastEvaluatedKey;
  }
}
