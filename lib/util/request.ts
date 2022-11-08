import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'
import { SORT_REGEX } from './field-validator'

export const getRequestedParams = (queryFilters: GetOrdersQueryParams) => {
  const filtered = Object.keys(queryFilters).filter((requestedParam) => {
    return ![GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT].includes(requestedParam as GET_QUERY_PARAMS)
  })

  return filtered
}

export const validateSortQueryParams = (queryFilters: GetOrdersQueryParams) => {
  if (queryFilters.sortKey || queryFilters.sort) {
    if (!(queryFilters.sortKey && queryFilters.sort)) {
      return {
        statusCode: 400,
        detail: 'Need both a sortKey and sort in order to query with sorting.',
        errorCode: 'VALIDATION_ERROR',
      }
    }
    if (getRequestedParams(queryFilters).length == 0) {
      return {
        statusCode: 400,
        detail: "Can't query sortKey and sort without additional query params.",
        errorCode: 'VALIDATION_ERROR',
      }
    }
  }
  return null
}

enum COMPARISON_OPERATORS {
  GT = 'gt',
  LT = 'lt',
  GTE = 'gte',
  LTE = 'lte',
  BETWEEN = 'between',
}

type ComparisonFilter = {
  operator: string
  values: number[]
}

export function parseComparisonFilter(queryParam: string | undefined): ComparisonFilter {
  const match = queryParam?.match(SORT_REGEX)
  if (!match || match.length != 4) {
    // the optional capturing group will be 'undefined' but still counts for .length
    throw new Error(`Unable to parse operator and value for query param: ${queryParam}`)
  }
  const operator = match[1]

  if (!Object.values(COMPARISON_OPERATORS).includes(operator as COMPARISON_OPERATORS)) {
    throw new Error(`Unsupported comparison operator ${operator} in query param ${queryParam}`)
  }

  const values = match.slice(2).map((v) => parseInt(v))

  return { operator: operator, values: values }
}
