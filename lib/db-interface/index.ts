import { DynamoDB } from 'aws-sdk'
import { ExpressionAttributeValueMap, QueryInput } from 'aws-sdk/clients/dynamodb'
import { default as Logger } from 'bunyan'
import { GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { Order } from '../handlers/types/order'

export abstract class DbInterface {
  public abstract dbClient: any
  abstract getOrders: (limit: number, queryFilters: { [key: string]: string }, _log?: Logger) => Promise<Order[]>
}

export class DynamoDbInterface implements DbInterface {
  public dbClient: DynamoDB.DocumentClient
  public tableName: string

  constructor(dbClient: DynamoDB.DocumentClient, tableName: string) {
    this.dbClient = dbClient
    this.tableName = tableName
  }

  public async getOrders(limit: number, queryFilters: { [key: string]: string }, _log?: Logger): Promise<Order[]> {
    const requestedParams = Object.keys(queryFilters)

    // TODO: Change query strings to enum that we will get from the DynamoDB Mapper
    // Build the query input based on the requested params
    let queryInput = {}
    switch (true) {
      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_HASH], requestedParams):
        queryInput = this.getQueryInput(
          'orderHash = :orderHash',
          {
            ':orderHash': `${queryFilters['orderHash']}`,
          } as ExpressionAttributeValueMap,
          limit
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        queryInput = this.getQueryInput(
          'offerer = :offerer',
          {
            ':offerer': `${queryFilters['offerer']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offererIndex'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          'orderStatus = :orderStatus',
          {
            ':orderStatus': `${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'orderStatusIndex'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        queryInput = this.getQueryInput(
          'sellToken = :sellToken',
          {
            ':sellToken': `${queryFilters['sellToken']}`,
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
          'offererOrderStatus = :offererOrderStatus and sellToken = :sellToken',
          {
            ':offererOrderStatus': `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
            ':sellToken': queryFilters['sellToken'],
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-orderStatus-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          'offererOrderStatus = :offererOrderStatus',
          {
            ':offererOrderStatus': `${queryFilters['offerer']}-${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-orderStatus-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.SELL_TOKEN], requestedParams):
        queryInput = this.getQueryInput(
          'offererSellToken = :offererSellToken',
          {
            ':offererSellToken': `${queryFilters['offerer']}-${queryFilters['sellToken']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'offerer-sellToken-index'
        )
        break

      case this.areParamsRequested([GET_QUERY_PARAMS.SELL_TOKEN, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        queryInput = this.getQueryInput(
          'sellTokenOrderStatus = :sellTokenOrderStatus',
          {
            ':sellTokenOrderStatus': `${queryFilters['sellToken']}-${queryFilters['orderStatus']}`,
          } as ExpressionAttributeValueMap,
          limit,
          'sellToken-orderStatus-index'
        )
        break

      default:
        // TODO: Implement more cases
        const getOrdersResponse = await this.dbClient
          .scan({
            TableName: this.tableName,
            ...(limit && { Limit: limit }),
          })
          .promise()
        return getOrdersResponse.Items as Order[]
    }

    const ordersRequest = await this.dbClient.query(queryInput as QueryInput).promise()
    return ordersRequest.Items as Order[]
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

  private areParamsRequested(queryParams: GET_QUERY_PARAMS[], requestedParams: string[]): boolean {
    return (
      queryParams.every((filter) => requestedParams.includes(filter)) && requestedParams.length == queryParams.length
    )
  }
}
