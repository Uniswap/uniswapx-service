import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Joi from 'joi'

import { OrderType } from '@uniswap/uniswapx-sdk'
import { InvalidTokenInAddress } from '../../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../errors/TooManyOpenOrdersError'
import { HttpStatusCode } from '../../HttpStatusCode'
import { DutchV1Order } from '../../models/DutchV1Order'
import { LimitOrder } from '../../models/LimitOrder'
import { UniswapXOrderService } from '../../services/UniswapXOrderService'
import { metrics } from '../../util/metrics'
import {
  APIGLambdaHandler,
  APIHandleRequestParams,
  ApiInjector,
  ApiRInj,
  ErrorCode,
  ErrorResponse,
  Response,
} from '../base'
import { PostOrderBodyParser } from './PostOrderBodyParser'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

export class PostOrderHandler extends APIGLambdaHandler<
  unknown,
  ApiRInj,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  constructor(
    handlerName: string,
    injectorPromise: Promise<ApiInjector<unknown, ApiRInj, PostOrderRequestBody, void>>,
    private readonly service: UniswapXOrderService,
    private readonly bodyParser: PostOrderBodyParser
  ) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(
    params: APIHandleRequestParams<unknown, ApiRInj, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody,
      requestInjected: { log },
    } = params

    log.info('Handling POST order request', params)

    let order: DutchV1Order | LimitOrder

    try {
      order = this.createOrderFromBody(requestBody)
    } catch (e: unknown) {
      log.error(e, 'Failed to parse order')
      return {
        statusCode: HttpStatusCode.BadRequest,
        errorCode: ErrorCode.OrderParseFail,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    try {
      const orderHash = await this.service.createOrder(order.inner, order.signature, order.quoteId)
      return {
        statusCode: HttpStatusCode.Created,
        body: { hash: orderHash },
      }
    } catch (err) {
      if (err instanceof OrderValidationFailedError) {
        return {
          statusCode: HttpStatusCode.BadRequest,
          errorCode: ErrorCode.InvalidOrder,
          detail: err.message,
        }
      }

      if (err instanceof TooManyOpenOrdersError) {
        return {
          statusCode: HttpStatusCode.Forbidden,
          errorCode: ErrorCode.TooManyOpenOrders,
        }
      }

      if (err instanceof InvalidTokenInAddress) {
        return {
          statusCode: HttpStatusCode.BadRequest,
          errorCode: ErrorCode.InvalidTokenInAddress,
        }
      }

      return {
        statusCode: HttpStatusCode.InternalServerError,
        errorCode: ErrorCode.InternalError,
        ...(err instanceof Error && { detail: err.message }),
      }
    }
  }

  private createOrderFromBody(body: PostOrderRequestBody): DutchV1Order | LimitOrder {
    const order = this.bodyParser.fromPostRequest(body)
    if (order.orderType === OrderType.Dutch) {
      return order as DutchV1Order
    }

    if (order.orderType === OrderType.Limit) {
      return order as LimitOrder
    }
    throw new Error(`No handler available for order type: ${order.orderType}`)
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return PostOrderRequestBodyJoi
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return PostOrderResponseJoi
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

    const postOrderByChainMetricName = `PostOrderChainId${chainId.toString()}Status${statusCodeMod}`
    metrics.putMetric(postOrderByChainMetricName, 1, Unit.Count)

    const postOrderMetricName = `PostOrderStatus${statusCodeMod}`
    metrics.putMetric(postOrderMetricName, 1, Unit.Count)

    const postOrderRequestMetricName = `PostOrderRequest`
    metrics.putMetric(postOrderRequestMetricName, 1, Unit.Count)

    const postOrderRequestByChainIdMetricName = `PostOrderRequestChainId${chainId.toString()}`
    metrics.putMetric(postOrderRequestByChainIdMetricName, 1, Unit.Count)
  }
}
