import Joi from 'joi'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Logger from 'bunyan'
import { UniswapXOrderEntity } from '../../entities'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { metrics } from '../../util/metrics'
import {
  APIGLambdaHandler,
  APIHandleRequestParams,
  ApiInjector,
  ErrorCode,
  ErrorResponse,
  Response,
} from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
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

type GetOrdersBody = GetOrdersResponse<
  | UniswapXOrderEntity
  | GetDutchV2OrderResponse
  | GetDutchV3OrderResponse
  | GetPriorityOrderResponse
  | undefined
>

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams,
  GetOrdersBody
> {
  constructor(
    handlerName: string,
    injectorPromise: Promise<ApiInjector<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams>>,
    private readonly orderDispatcher: OrderDispatcher,
    private readonly options: GetOrdersHandlerOptions = GET_ORDERS_HANDLER_OPTIONS
  ) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams>
  ): Promise<Response<GetOrdersBody> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, orderType, log },
      containerInjected: { dbInterface },
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
      const getOrdersResult = await dbInterface.getOrders(limit, queryFilters, cursor)

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

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the chain id from the raw json.
    let chainId = '0'
    try {
      const rawBody = JSON.parse(event.body!)
      chainId = rawBody.chainId ?? chainId
    } catch (err) {
      // no-op. If we can't get chainId still log the metric as chain 0
    }
    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const getOrdersByChainMetricName = `GetOrdersChainId${chainId.toString()}Status${statusCodeMod}`
    metrics.putMetric(getOrdersByChainMetricName, 1, Unit.Count)

    const getOrdersMetricName = `GetOrdersStatus${statusCodeMod}`
    metrics.putMetric(getOrdersMetricName, 1, Unit.Count)

    const getOrdersRequestMetricName = `GetOrdersRequest`
    metrics.putMetric(getOrdersRequestMetricName, 1, Unit.Count)

    const getOrdersRequestByChainIdMetricName = `GetOrdersRequestChainId${chainId.toString()}`
    metrics.putMetric(getOrdersRequestByChainIdMetricName, 1, Unit.Count)
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
