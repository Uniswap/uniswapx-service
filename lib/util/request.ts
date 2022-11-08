import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../handlers/get-orders/schema'

export const getRequestedParams = (queryFilters: GetOrdersQueryParams) => {
  const filtered = Object.keys(queryFilters).filter((requestedParam) => {
    return ![GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT].includes(requestedParam as GET_QUERY_PARAMS)
  })

  return filtered
}
