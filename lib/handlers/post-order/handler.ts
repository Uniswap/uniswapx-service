import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Joi from 'joi'

import { InvalidTokenInAddress } from '../../errors/InvalidTokenInAddress'
import { NoHandlerConfiguredError } from '../../errors/NoHandlerConfiguredError'
import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../errors/TooManyOpenOrdersError'
import { HttpStatusCode } from '../../HttpStatusCode'
import { Order } from '../../models/Order'
import { OrderDispatcher } from '../../services/OrderDispatcher'
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

export function tryParseChainIdFromBody(event: APIGatewayProxyEvent) {
  // Try and extract the chain id from the raw json.
  if (!event || !event.body) {
    return '0'
  }

  try {
    const rawBody = JSON.parse(event.body)
    const chainId = rawBody.chainId ?? '0'
    return chainId
  } catch (err) {
    return '0'
  }
}
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
    private readonly orderDispatcher: OrderDispatcher,
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

    let order: Order

    try {
      order = this.bodyParser.fromPostRequest(requestBody)
    } catch (e: unknown) {
      log.error(e, 'Failed to parse order')
      return {
        statusCode: HttpStatusCode.BadRequest,
        errorCode: ErrorCode.OrderParseFail,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    try {
      const orderHash = await this.orderDispatcher.createOrder(order)
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

      if (err instanceof NoHandlerConfiguredError) {
        return {
          statusCode: HttpStatusCode.InternalServerError,
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

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    const chainId = tryParseChainIdFromBody(event)

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
