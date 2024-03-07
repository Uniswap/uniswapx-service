import { DutchOrder } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Joi from 'joi'

import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../errors/TooManyOpenOrdersError'
import { HttpStatusCode } from '../../HttpStatusCode'
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
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

export class PostOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  ApiRInj,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  constructor(
    handlerName: string,
    injectorPromise: Promise<ApiInjector<ContainerInjected, ApiRInj, PostOrderRequestBody, void>>,
    private readonly onChainValidatorMap: OnChainValidatorMap
  ) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, ApiRInj, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody: { encodedOrder, signature, chainId, quoteId },
      requestInjected: { log },
      containerInjected: { dbInterface, orderValidator, orderType, getMaxOpenOrders },
    } = params

    log.info('Handling POST order request', params)
    log.info(
      {
        onchainValidatorByChainId: this.onChainValidatorMap.debug(),
      },
      'onchain validators'
    )

    let decodedOrder: DutchOrder

    try {
      decodedOrder = DutchOrder.parse(encodedOrder, chainId) as DutchOrder
    } catch (e: unknown) {
      log.error(e, 'Failed to parse order')
      return {
        statusCode: HttpStatusCode.BadRequest,
        errorCode: ErrorCode.OrderParseFail,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    const service = new UniswapXOrderService(
      orderValidator,
      this.onChainValidatorMap.get(chainId),
      dbInterface,
      log,
      getMaxOpenOrders
    )

    try {
      const orderHash = await service.createOrder(decodedOrder, signature, quoteId, orderType)
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
