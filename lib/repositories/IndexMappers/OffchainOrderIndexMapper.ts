import { TABLE_KEY } from '../../config/dynamodb'
import { GET_QUERY_PARAMS, GetOrdersQueryParams } from '../../handlers/get-orders/schema'

// The GSI a GET's filters select. The index fields rows carry are built in core/orders/storedRow.ts.
export class OffchainOrderIndexMapper {
  public getRequestedParams(queryFilters: GetOrdersQueryParams) {
    // Fields to disregard when deriving indices
    const SORT_FIELDS = [GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT, GET_QUERY_PARAMS.DESC]
    const OTHER_IGNORED_FIELDS = [GET_QUERY_PARAMS.ORDER_TYPE]
    const isIgnoredField = (requestedParam: string) =>
      SORT_FIELDS.includes(requestedParam as GET_QUERY_PARAMS) ||
      OTHER_IGNORED_FIELDS.includes(requestedParam as GET_QUERY_PARAMS)

    return Object.keys(queryFilters).filter((param) => !isIgnoredField(param))
  }

  private areParamsRequested(queryParams: GET_QUERY_PARAMS[], requestedParams: string[]): boolean {
    return (
      requestedParams.length == queryParams.length && queryParams.every((filter) => requestedParams.includes(filter))
    )
  }

  public getIndexFromParams(
    queryFilters: GetOrdersQueryParams
  ): { index: string; partitionKey: string | number } | undefined {
    const requestedParams = this.getRequestedParams(queryFilters)
    switch (true) {
      case this.areParamsRequested(
        [GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS],
        requestedParams
      ):
        return {
          partitionKey: `${queryFilters['filler']}_${queryFilters['offerer']}_${queryFilters['orderStatus']}`,
          index: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.FILLER], requestedParams):
        return {
          partitionKey: `${queryFilters['chainId']}_${queryFilters['filler']}`,
          index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return {
          partitionKey: `${queryFilters['chainId']}_${queryFilters['orderStatus']}`,
          index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
        }
      case this.areParamsRequested(
        [GET_QUERY_PARAMS.CHAIN_ID, GET_QUERY_PARAMS.ORDER_STATUS, GET_QUERY_PARAMS.FILLER],
        requestedParams
      ):
        return {
          partitionKey: `${queryFilters['chainId']}_${queryFilters['orderStatus']}_${queryFilters['filler']}`,
          index: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return {
          partitionKey: `${queryFilters['filler']}_${queryFilters['orderStatus']}`,
          index: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER, GET_QUERY_PARAMS.OFFERER], requestedParams):
        return {
          partitionKey: `${queryFilters['filler']}_${queryFilters['offerer']}`,
          index: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER, GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return {
          partitionKey: `${queryFilters['offerer']}_${queryFilters['orderStatus']}`,
          index: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.OFFERER], requestedParams):
        return {
          partitionKey: queryFilters['offerer'] as string,
          index: TABLE_KEY.OFFERER,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.ORDER_STATUS], requestedParams):
        return {
          partitionKey: queryFilters['orderStatus'] as string,
          index: TABLE_KEY.ORDER_STATUS,
        }
      case this.areParamsRequested([GET_QUERY_PARAMS.FILLER], requestedParams):
        return {
          partitionKey: queryFilters['filler'] as string,
          index: TABLE_KEY.FILLER,
        }

      case this.areParamsRequested([GET_QUERY_PARAMS.CHAIN_ID], requestedParams):
        return {
          partitionKey: queryFilters['chainId'] as number,
          index: TABLE_KEY.CHAIN_ID,
        }

      case this.areParamsRequested([GET_QUERY_PARAMS.PAIR], requestedParams):
        return {
          partitionKey: queryFilters['pair'] as string,
          index: TABLE_KEY.PAIR,
        }
    }
    return undefined
  }
}
