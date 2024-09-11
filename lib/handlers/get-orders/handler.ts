import Joi from 'joi'

import { OrderType } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { UniswapXOrderEntity } from '../../entities'
import { OrderDispatcher } from '../../services/OrderDispatcher'
import { log } from '../../util/log'
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
import { GetRelayOrderResponse, GetRelayOrdersResponseJoi } from './schema/GetRelayOrderResponse'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, RawGetOrdersQueryParams } from './schema/index'
import { getCommentRange } from 'typescript'
export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams,
  GetOrdersResponse<
    UniswapXOrderEntity | GetDutchV2OrderResponse | GetRelayOrderResponse | GetPriorityOrderResponse | undefined
  >
> {
  constructor(
    handlerName: string,
    injectorPromise: Promise<ApiInjector<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams>>,
    private readonly orderDispatcher: OrderDispatcher
  ) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams>
  ): Promise<
    | Response<
        GetOrdersResponse<
          UniswapXOrderEntity | GetDutchV2OrderResponse | GetRelayOrderResponse | GetPriorityOrderResponse | undefined
        >
      >
    | ErrorResponse
  > {
    const {
      requestInjected: { limit, queryFilters, cursor, includeV2, orderType },
      containerInjected: { dbInterface },
    } = params

    this.logMetrics(queryFilters)

    try {
      if (orderType) {
        const getOrdersResult = await this.orderDispatcher.getOrder(orderType, {
          limit,
          params: queryFilters,
          cursor,
        })

        return {
          statusCode: 200,
          body: getOrdersResult,
        }
      }

      //without orderType specified, keep legacy implementation
      const getOrdersResult = await dbInterface.getOrders(limit, queryFilters, cursor)
      if (!includeV2) {
        getOrdersResult.orders = getOrdersResult.orders.filter((order) => order.type !== OrderType.Dutch_V2)
      }

      return {
        statusCode: 200,
        body: {
          // w/o specifying orderType, the orderDispatcher uses the legacy get implementation
          //   and for priority orders, the returned object will contain offerer instead of swapper
          orders: getOrdersResult.orders.map((order: any) => {
            if (order.offerer) {
              const { offerer, ...rest } = order;
              return {
                ...rest,
                swapper: offerer
              };
            }
            return order;
          }),
          cursor: getOrdersResult.cursor
        },
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

  private logMetrics(queryFilters: GetOrdersQueryParams) {
    // This log is used for generating a metrics dashboard, do not modify.
    log.info({ queryFiltersSorted: Object.keys(queryFilters).sort().join(',') }, 'Get orders query filters for metrics')
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return GetOrdersQueryParamsJoi
  }

  protected responseBodySchema(): Joi.Schema | null {
    return Joi.alternatives(GetOrdersResponseJoi, GetRelayOrdersResponseJoi)
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
