import Joi from 'joi'

import { OrderType } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { RelayOrderEntity, UniswapXOrderEntity } from '../../entities'
import { RelayOrder } from '../../models'
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
import { GetOrdersResponse } from './schema/GetOrdersResponse'
import { GetRelayOrderResponse } from './schema/GetRelayOrderResponse'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, RawGetOrdersQueryParams } from './schema/index'

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams,
  GetOrdersResponse<UniswapXOrderEntity | GetRelayOrderResponse | undefined>
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
  ): Promise<Response<GetOrdersResponse<UniswapXOrderEntity | GetRelayOrderResponse | undefined>> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, cursor, includeV2, orderType },
      containerInjected: { dbInterface },
    } = params

    this.logMetrics(queryFilters)

    try {
      if (orderType === OrderType.Relay) {
        const getOrdersResult = await this.orderDispatcher.getOrder<RelayOrderEntity>(orderType, {
          limit,
          params: queryFilters,
          cursor,
        })
        const resultList: GetRelayOrderResponse[] = []
        for (let i = 0; i < getOrdersResult.orders.length; i++) {
          const relayOrder = RelayOrder.fromEntity(getOrdersResult.orders[i])
          resultList.push(relayOrder.toGetResponse())
        }
        return {
          statusCode: 200,
          body: { orders: resultList, cursor },
        }
      }
      const getOrdersResult = await dbInterface.getOrders(limit, queryFilters, cursor)
      if (!includeV2) {
        getOrdersResult.orders = getOrdersResult.orders.filter((order) => order.type !== OrderType.Dutch_V2)
      }

      return {
        statusCode: 200,
        body: getOrdersResult,
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
    return null // Joi.alternatives(GetOrdersResponseJoi, GetRelayOrdersResponseJoi)
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
