import { Unit } from 'aws-embedded-metrics'
import Joi from 'joi'

import { InvalidTokenInAddress } from '../../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../errors/TooManyOpenOrdersError'
import { HttpStatusCode } from '../../HttpStatusCode'
import { OrderPoster } from '../../services/OrderPoster'
import { metrics } from '../../util/metrics'
import {
  APIGLambdaHandler,
  APIHandleRequestParams,
  ApiRInj,
  ErrorCode,
  ErrorResponse,
  RequestMetricsConfig,
  Response,
} from '../base'
import { PostableOrder, PostOrderBodyParser } from './PostOrderBodyParser'
import { PostOrderRoute, wrongRouteDetail } from './routes'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

export class PostOrderHandler extends APIGLambdaHandler<ApiRInj, PostOrderRequestBody, void, PostOrderResponse> {
  constructor(
    handlerName: string,
    private readonly orderService: Pick<OrderPoster, 'createOrder'>,
    private readonly bodyParser: PostOrderBodyParser,
    private readonly route: PostOrderRoute
  ) {
    super(handlerName)
  }

  protected buildRequestInjected(base: ApiRInj): ApiRInj {
    return base
  }

  public async handleRequest(
    params: APIHandleRequestParams<ApiRInj, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody,
      requestInjected: { log },
    } = params

    let order: PostableOrder

    try {
      order = this.bodyParser.fromPostRequest(requestBody)
    } catch (e: unknown) {
      // The one log for a failed parse: the encoded order, never the signature.
      const { orderType, chainId, encodedOrder } = requestBody
      log.error({ err: e, orderType, chainId, encodedOrder }, 'Failed to parse order')
      return {
        statusCode: HttpStatusCode.BadRequest,
        errorCode: ErrorCode.OrderParseFail,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    const { info, chainId } = order.inner
    log.info(
      { orderType: order.orderType, orderHash: order.inner.hash(), chainId, swapper: info.swapper },
      'parsed order'
    )

    if (!this.route.accepts(order.orderType)) {
      log.warn({ orderType: order.orderType, route: this.route.path }, 'Rejected order posted to the wrong route')
      metrics.putMetric('PostOrderWrongRoute', 1, Unit.Count)
      return {
        statusCode: HttpStatusCode.BadRequest,
        errorCode: ErrorCode.InvalidOrder,
        detail: wrongRouteDetail(order.orderType),
      }
    }

    try {
      const orderHash = await this.orderService.createOrder(order)
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

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return PostOrderRequestBodyJoi
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return null
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return PostOrderResponseJoi
  }

  protected requestMetricsConfig(): RequestMetricsConfig {
    return { prefix: 'PostOrder', chainIdFrom: 'body' }
  }
}
