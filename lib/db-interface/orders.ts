import { DynamoDB } from 'aws-sdk'
import { DocumentClient, ExpressionAttributeValueMap, QueryInput } from 'aws-sdk/clients/dynamodb'
import { default as Logger } from 'bunyan'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { Order } from '../handlers/types/order'
import { TABLE_KEY } from '../util/db'
import { BaseOrdersInterface } from './base'

export class DynamoOrdersInterface implements BaseOrdersInterface {
  constructor(public documentClient: DocumentClient, public tableName: string) {}

  public async getOrders(limit: number, queryFilters: GetOrdersQueryParams, _log?: Logger): Promise<Order[]> {
    const requestedParams = Object.keys(queryFilters)

    // TODO: Clean these queries up by using a data mapper 
    // Build the query input based on the requested params
    let queryInput = {}
    switch (true) {
      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_HASH], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.ORDER_HASH} = :${TABLE_KEY.ORDER_HASH}`,
          {
            [`:${TABLE_KEY.ORDER_HASH}`]: `${queryFilters['orderHash']}`,
          } as ExpressionAttributeValueMap,
          limit
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.OFFERER} = :${TABLE_KEY.OFFERER}`,
          {
            [`:${TABLE_KEY.OFFERER}`]: `${queryFilters['offerer']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offererIndex'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.ORDER_STATUS} = :${TABLE_KEY.ORDER_STATUS}`,
          {
            [`:${TABLE_KEY.ORDER_STATUS}`]: `${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'orderStatusIndex'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.SELL_TOKEN} = :${TABLE_KEY.SELL_TOKEN}`,
          {
            [`:${TABLE_KEY.SELL_TOKEN}`]: `${queryFilters['sellToken']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'sellTokenIndex'
        )
        break

      case this.areParamsRequested(
        [GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.OFFERER_ORDER_STATUS} = :${TABLE_KEY.OFFERER_ORDER_STATUS} and ${TABLE_KEY.SELL_TOKEN} = :${TABLE_KEY.SELL_TOKEN}`,
          {
            [`:${TABLE_KEY.OFFERER_ORDER_STATUS}`]: `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
            [`:${TABLE_KEY.SELL_TOKEN}`]: `${queryFilters['sellToken']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-orderStatus-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.OFFERER_ORDER_STATUS} = :${TABLE_KEY.OFFERER_ORDER_STATUS}`,
          {
            [`:${TABLE_KEY.OFFERER_ORDER_STATUS}`]: `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-orderStatus-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.OFFERER_SELL_TOKEN} = :${TABLE_KEY.OFFERER_SELL_TOKEN}`,
          {
            [`:${TABLE_KEY.OFFERER_SELL_TOKEN}`]: `${queryFilters['offerer']}-${queryFilters['sellToken']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-sellToken-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          `${TABLE_KEY.SELL_TOKEN_ORDER_STATUS} = :${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}`,
          {
            [`:${TABLE_KEY.SELL_TOKEN_ORDER_STATUS}`]: `${queryFilters['sellToken']}-${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'sellToken-orderStatus-index'
        )
        break

      default:
        const getOrdersScan = await this.documentClient
          .scan({
            TableName: this.tableName,
            ...(limit && { Limit: limit }),
          })
          .promise()
        return this.formatOrderItems(getOrdersScan.Items)
    }

    const getOrdersQuery = await this.documentClient.query(queryInput as QueryInput).promise()
    return this.formatOrderItems(getOrdersQuery.Items)
  }

  private getQueryInput(
    keyConditionExpression: string,
    expressionAttributeValues: ExpressionAttributeValueMap,
    limit: number | undefined,
    indexName?: string
  ): QueryInput {
    return {
      TableName: this.tableName,
      ...(indexName && { IndexName: indexName }),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(limit && { Limit: limit }),
    }
  }

  private formatOrderItems(orders: DynamoDB.DocumentClient.ItemList | undefined): Order[] {
    if (!orders) {
      return []
    }

    const formattedOrders: Order[] = []
    for (const order of orders) {
      formattedOrders.push({
        createdAt: order[TABLE_KEY.CREATED_AT],
        encodedOrder: order[TABLE_KEY.ENCODED_ORDER],
        signature: order[TABLE_KEY.SIGNATURE],
        orderHash: order[TABLE_KEY.ORDER_HASH],
        orderStatus: order[TABLE_KEY.ORDER_STATUS],
        offerer: order[TABLE_KEY.OFFERER],
      })
    }

    return formattedOrders
  }

  private areParamsRequested(queryParams: GET_QUERY_PARAMS[], requestedParams: string[]): boolean {
    return (
      requestedParams.length == queryParams.length && queryParams.every((filter) => requestedParams.includes(filter))
    )
  }
}
