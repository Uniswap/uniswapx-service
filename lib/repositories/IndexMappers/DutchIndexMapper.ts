import { TABLE_KEY } from '../../config/dynamodb'
import { DutchOrderEntity, ORDER_STATUS } from '../../entities'
import { GetOrdersQueryParams, GET_QUERY_PARAMS } from '../../handlers/get-orders/schema'
import { IndexFieldsForUpdate, IndexMapper } from './IndexMapper'

export class DutchIndexMapper implements IndexMapper<DutchOrderEntity> {
  public getRequestedParams(queryFilters: GetOrdersQueryParams) {
    const SORT_FIELDS = [GET_QUERY_PARAMS.SORT_KEY, GET_QUERY_PARAMS.SORT, GET_QUERY_PARAMS.DESC]
    const isSortKey = (requestedParam: string) => SORT_FIELDS.includes(requestedParam as GET_QUERY_PARAMS)

    return Object.keys(queryFilters).filter((param) => !isSortKey(param))
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
    }
    return undefined
  }

  getIndexFieldsForUpdate(order: DutchOrderEntity): IndexFieldsForUpdate {
    return {
      offerer_orderStatus: `${order.offerer}_${order.orderStatus}`,
      filler_orderStatus: `${order.filler}_${order.orderStatus}`,
      filler_offerer: `${order.filler}_${order.offerer}`,
      chainId_filler: `${order.chainId}_${order.filler}`,
      chainId_orderStatus: `${order.chainId}_${order.orderStatus}`,
      chainId_orderStatus_filler: `${order.chainId}_${order.orderStatus}_${order.filler}`,
      filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${order.orderStatus}`,
    }
  }

  getIndexFieldsForStatusUpdate(order: DutchOrderEntity, newStatus: ORDER_STATUS): IndexFieldsForUpdate {
    return {
      orderStatus: newStatus,
      offerer_orderStatus: `${order.offerer}_${newStatus}`,
      filler_orderStatus: `${order.filler}_${newStatus}`,
      filler_offerer_orderStatus: `${order.filler}_${order.offerer}_${newStatus}`,
      chainId_orderStatus: `${order.chainId}_${newStatus}`,
      chainId_orderStatus_filler: `${order.chainId}_${newStatus}_${order.filler}`,
    }
  }
}
