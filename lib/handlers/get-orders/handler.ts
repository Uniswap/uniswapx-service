import Joi from 'joi'

import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { log } from '../../util/log'
import { metrics } from '../../util/metrics'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import {
  GetOrdersQueryParams,
  GetOrdersQueryParamsJoi,
  GetOrdersResponse,
  GetOrdersResponseJoi,
  RawGetOrdersQueryParams,
} from './schema/index'

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  RawGetOrdersQueryParams,
  GetOrdersResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, RawGetOrdersQueryParams>
  ): Promise<Response<GetOrdersResponse> | ErrorResponse> {
    const {
      requestInjected: { limit, queryFilters, cursor },
      containerInjected: { dbInterface },
    } = params

    this.logMetrics(queryFilters)

    try {
      const getOrdersResult = await dbInterface.getOrders(limit, queryFilters, cursor)

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

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetOrdersResponseJoi
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the chain id from the raw json.
    let chainId = '0'
    try {
      const rawBody = JSON.parse(event.body!)
      chainId = rawBody.chainId
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
