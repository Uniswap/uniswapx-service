import Joi from 'joi'
import Logger from 'bunyan'
import { UniswapXOrderEntity } from '../../entities'
import { BaseOrdersRepository } from '../../repositories/base'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import {
  APIGLambdaHandler,
  APIHandleRequestParams,
  ApiRInj,
  ErrorCode,
  ErrorResponse,
  RequestMetricsConfig,
  Response,
} from '../base/index'
import { parseGetQueryParams } from './query-params'
import { GetDutchV2OrderResponse } from './schema/GetDutchV2OrderResponse'
import { GetOrdersResponse, GetOrdersResponseJoi } from './schema/GetOrdersResponse'
import { GetPriorityOrderResponse } from './schema/GetPriorityOrderResponse'
import {
  GetLimitOrdersQueryParamsJoi,
  GetOrdersQueryParams,
  GetOrdersQueryParamsJoi,
  RawGetOrdersQueryParams,
} from './schema/index'
import { GetDutchV3OrderResponse } from './schema/GetDutchV3OrderResponse'
import { GetOrderTypeQueryParamEnum } from './schema/GetOrderTypeQueryParamEnum'

export type GetOrdersHandlerOptions = {
  queryParamsSchema: Joi.ObjectSchema
  // Whether the endpoint pages: reads a request cursor and returns the next one. A
  // single-page endpoint ignores an incoming cursor and never hands one out.
  paginated: boolean
}

// GET /orders: one page of the newest orders; non-default sort params and any cursor are a 400 (see schema/index.ts).
export const GET_ORDERS_HANDLER_OPTIONS: GetOrdersHandlerOptions = {
  queryParamsSchema: GetOrdersQueryParamsJoi,
  paginated: false,
}

// GET /limit-orders: still pages with a cursor and accepts sortKey/sort/desc.
export const GET_LIMIT_ORDERS_HANDLER_OPTIONS: GetOrdersHandlerOptions = {
  queryParamsSchema: GetLimitOrdersQueryParamsJoi,
  paginated: true,
}

export interface RequestInjected extends ApiRInj {
  limit: number
  queryFilters: GetOrdersQueryParams
  // Only ever set for GET /limit-orders; GET /orders rejects the parameter.
  cursor?: string
  orderType?: GetOrderTypeQueryParamEnum
}

type GetOrdersBody = GetOrdersResponse<
  | UniswapXOrderEntity
  | GetDutchV2OrderResponse
  | GetDutchV3OrderResponse
  | GetPriorityOrderResponse
  | undefined
>

export class GetOrdersHandler extends APIGLambdaHandler<
  RequestInjected,
  void,
  RawGetOrdersQueryParams,
  GetOrdersBody
> {
  constructor(
    handlerName: string,
    // The table this endpoint reads when the request names no orderType: the one its order
    // service reads.
    private readonly repository: Pick<BaseOrdersRepository<UniswapXOrderEntity>, 'getOrders'>,
    private readonly orderDispatcher: OrderDispatcher,
    private readonly options: GetOrdersHandlerOptions = GET_ORDERS_HANDLER_OPTIONS
  ) {
    super(handlerName)
  }

  protected buildRequestInjected(
    base: ApiRInj,
    _requestBody: void,
    requestQueryParams: RawGetOrdersQueryParams
  ): RequestInjected {
    return { ...parseGetQueryParams(requestQueryParams), ...base }
  }

  public async handleRequest(
    params: APIHandleRequestParams<RequestInjected, void, RawGetOrdersQueryParams>
  ): Promise<Response<GetOrdersBody> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, orderType, log },
    } = params
    // The single-page schema already rejects a cursor; this keeps the contract even if the
    // schema and the option ever disagree.
    const cursor = this.options.paginated ? params.requestInjected.cursor : undefined

    this.logMetrics(log, queryFilters)

    try {
      if (orderType) {
        const getOrdersResult = await this.orderDispatcher.getOrder(orderType, {
          limit,
          params: queryFilters,
          cursor,
        })

        return {
          statusCode: 200,
          body: this.withCursor({ ...getOrdersResult, orders: getOrdersResult.orders.map(offererToSwapper) }),
        }
      }

      //without orderType specified, keep legacy implementation
      const getOrdersResult = await this.repository.getOrders(limit, queryFilters, cursor)

      return {
        statusCode: 200,
        body: this.withCursor({
          orders: getOrdersResult.orders.map(offererToSwapper),
          cursor: getOrdersResult.cursor,
        }),
      }
    } catch (e: unknown) {
      // TODO: differentiate between input errors and add logging if unknown is not type Error
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
      }
    }
  }

  // The repository reports a cursor whenever more rows exist; only a paginated endpoint
  // passes it on. (undefined is dropped by JSON serialization.)
  private withCursor<R extends { cursor?: string }>(result: R): R {
    return this.options.paginated ? result : { ...result, cursor: undefined }
  }

  private logMetrics(log: Logger, queryFilters: GetOrdersQueryParams) {
    // This log is used for generating a metrics dashboard, do not modify.
    log.info({ queryFiltersSorted: Object.keys(queryFilters).sort().join(',') }, 'Get orders query filters for metrics')
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return this.options.queryParamsSchema
  }

  protected responseBodySchema(): Joi.Schema | null {
    return GetOrdersResponseJoi
  }

  // Always counted under chain 0: the counters never read the query's chainId.
  protected requestMetricsConfig(): RequestMetricsConfig {
    return { prefix: 'GetOrders', chainIdFrom: 'none' }
  }
}

// Stored rows key the swapper as `offerer`, but the response schema only has `swapper` and strips
// unknown fields, so a row returned as stored would lose its swapper. This covers both the
// no-orderType path and the typed paths that return stored rows (Dutch, Dutch_V1_V2's V1 rows,
// Limit); responses built from the decoded order already carry `swapper` and pass through.
function offererToSwapper<T>(order: T): T {
  if (order && typeof order === 'object' && 'offerer' in order) {
    const { offerer, ...rest } = order as T & { offerer: string }
    return { ...rest, swapper: offerer } as T
  }
  return order
}
