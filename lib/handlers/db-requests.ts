import { DynamoDB } from 'aws-sdk'
import { QueryInput } from 'aws-sdk/clients/dynamodb'
import { default as Logger } from 'bunyan'
import { Order } from './types/order'

const getFilteredKeys = (filters: { [key: string]: string | undefined | number }): string[] => {
  const filteredKeys: string[] = []
  for (const key of Object.keys(filters)) {
    if (filters[key]) {
      filteredKeys.push(key)
    }
  }
  return filteredKeys
}

export const getOrders = async (
  limit: number,
  filters: { [key: string]: string | undefined | number },
  _log?: Logger
): Promise<Array<Order>> => {
  const dynamoClient = new DynamoDB.DocumentClient()
  const filteredKeys = getFilteredKeys(filters)

  if (!filteredKeys.length) {
    const getOrdersResponse = await dynamoClient
      .scan({
        TableName: 'Orders',
        ...(limit && { Limit: limit }),
      })
      .promise()
    return getOrdersResponse.Items as Order[]
  }

  let params = {}
  if (filteredKeys.length == 1) {
    const firstFilterKey = filteredKeys[0]
    params = {
      TableName: 'Orders',
      IndexName: `${firstFilterKey}Index`,
      ScanIndexForward: true,
      KeyConditionExpression: `${firstFilterKey} = :${firstFilterKey}`,
      ExpressionAttributeValues: {
        [`:${firstFilterKey}`]: filters[firstFilterKey],
      },
      ...(limit && { Limit: limit }),
    }
  } else {
    const filterExpressions = []
    const filteAttributeValues = {}
    for (const filterKey of filteredKeys.slice(1)) {
      filterExpressions.push(`${filterKey} = :${filterKey}`)
      const key = `:${filterKey}`
      //@ts-ignore
      filteAttributeValues[key] = filters[filterKey]
    }
    const filterExpression = filterExpressions.length ? filterExpressions.join(' and ') : ''
    params = {
      TableName: 'Orders',
      ScanIndexForward: true,
      IndexName: `${filteredKeys[0]}Index`,
      KeyConditionExpression: `${filteredKeys[0]} = :${filteredKeys[0]} and deadline > :deadline`,
      ExpressionAttributeValues: {
        [`:${filteredKeys[0]}`]: filters[filteredKeys[0]],
        ...(filteAttributeValues && filteAttributeValues),
        ':deadline': 0,
      },
      ...(limit && { Limit: limit }),
      ...(filterExpression && { FilterExpression: filterExpression }),
    }
  }

  const ordersRequest = await dynamoClient.query(params as QueryInput).promise()

  return !ordersRequest ? [] : (ordersRequest.Items as Order[])
}
