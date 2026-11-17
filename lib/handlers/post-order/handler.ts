import { Unit } from 'aws-embedded-metrics'
import Joi from 'joi'

import { InvalidTokenInAddress } from '../../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { PostingHandedOffError } from '../../errors/PostingHandedOffError'
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
  INTERNAL_ERROR_DETAIL,
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
      ctx,
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
      const orderHash = await this.orderService.createOrder(ctx, order)
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

      // Answered like a wrong-route post: the order may be fine, but legacy no longer posts its chain.
      if (err instanceof PostingHandedOffError) {
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

      // The error's own text goes to the log, cut down, and not to the caller: an RPC provider's
      // error message carries the RPC URL and the request it sent.
      log.error({ error: loggableError(err) }, 'Unexpected error posting order')
      return {
        statusCode: HttpStatusCode.InternalServerError,
        errorCode: ErrorCode.InternalError,
        detail: INTERNAL_ERROR_DETAIL,
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

type LoggableError = { name?: string; code?: unknown; message: string; stack?: string; cause?: LoggableError }

// How deep to follow an error's `error` causes; ethers nests two or three.
const MAX_LOGGED_CAUSES = 3

/**
 * What of an unexpected error is safe to log. An RPC provider's error puts the RPC URL and the
 * request body in its message (on this path the body can hold the order's signature) and keeps
 * the same text without them as `reason`, so that is what is logged for one, with no stack: the
 * stack starts with the message. Its `error` cause is described the same way.
 */
function loggableError(err: unknown, depth = 0): LoggableError {
  if (!(err instanceof Error)) {
    return { message: String(err) }
  }
  const reason: unknown = Reflect.get(err, 'reason')
  const cause: unknown = Reflect.get(err, 'error')
  return {
    name: err.name,
    code: Reflect.get(err, 'code'),
    ...(typeof reason === 'string' ? { message: reason } : { message: err.message, stack: err.stack }),
    ...(cause instanceof Error && depth < MAX_LOGGED_CAUSES && { cause: loggableError(cause, depth + 1) }),
  }
}
