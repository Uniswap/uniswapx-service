import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { DutchOrder, OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Joi from 'joi'

import { OrderEntity, ORDER_STATUS } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { metrics } from '../../util/metrics'
import { formatOrderEntity } from '../../util/order'
import { currentTimestampInSeconds } from '../../util/time'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorCode, ErrorResponse, Response } from '../base'
import { kickoffOrderTrackingSfn } from '../shared/sfn'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

export class PostOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  ApiRInj,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, ApiRInj, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody: { encodedOrder, signature, chainId, quoteId },
      requestInjected: { log },
      containerInjected: { dbInterface, orderValidator, onchainValidatorByChainId, orderType, getMaxOpenOrders },
    } = params

    log.info('Handling POST order request', params)
    log.info(
      {
        onchainValidatorByChainId: Object.keys(onchainValidatorByChainId).map(
          (chainId) => onchainValidatorByChainId[Number(chainId)].orderQuoterAddress
        ),
      },
      'onchain validators'
    )
    let decodedOrder: DutchOrder

    try {
      decodedOrder = DutchOrder.parse(encodedOrder, chainId) as DutchOrder
    } catch (e: unknown) {
      log.error(e, 'Failed to parse order')
      return {
        statusCode: 400,
        errorCode: ErrorCode.OrderParseFail,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    const validationResponse = orderValidator.validate(decodedOrder)
    if (!validationResponse.valid) {
      return {
        statusCode: 400,
        errorCode: ErrorCode.InvalidOrder,
        detail: validationResponse.errorString,
      }
    }
    // onchain validation
    const onchainValidator = onchainValidatorByChainId[chainId]
    if (!onchainValidator) {
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        detail: `No onchain validator for chain ${chainId}`,
      }
    }
    const validation = await onchainValidator.validate({ order: decodedOrder, signature: signature })
    if (validation != OrderValidation.OK) {
      return {
        statusCode: 400,
        errorCode: ErrorCode.InvalidOrder,
        detail: `Onchain validation failed: ${OrderValidation[validation]}`,
      }
    }

    const order: OrderEntity = formatOrderEntity(decodedOrder, signature, OrderType.Dutch, ORDER_STATUS.OPEN, quoteId)
    const id = order.orderHash

    try {
      const orderCount = await dbInterface.countOrdersByOffererAndStatus(order.offerer, ORDER_STATUS.OPEN)
      if (orderCount > getMaxOpenOrders(order.offerer)) {
        log.info(orderCount, `${order.offerer} has too many open orders`)
        return {
          statusCode: 403,
          errorCode: ErrorCode.TooManyOpenOrders,
        }
      }
    } catch (e) {
      log.error(e, `failed to fetch open order count for ${order.offerer}`)
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    const stateMachineArn = checkDefined(process.env[`STATE_MACHINE_ARN_${chainId}`])

    try {
      await dbInterface.putOrderAndUpdateNonceTransaction(order)
      log.info(`Successfully inserted Order ${id} into DB`)
    } catch (e: unknown) {
      log.error(e, `Failed to insert order ${id} into DB`)
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
      }
    }

    // Log used for cw dashboard and redshift metrics, do not modify
    // skip fee output logging
    const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
    log?.info({
      eventType: 'OrderPosted',
      body: {
        quoteId: order.quoteId,
        createdAt: currentTimestampInSeconds(),
        orderHash: order.orderHash,
        startTime: order.decayStartTime,
        endTime: order.decayEndTime,
        deadline: order.deadline,
        chainId: order.chainId,
        inputStartAmount: order.input?.startAmount,
        inputEndAmount: order.input?.endAmount,
        tokenIn: order.input?.token,
        outputStartAmount: userOutput.startAmount,
        outputEndAmount: userOutput.endAmount,
        tokenOut: userOutput.token,
        filler: getAddress(order.filler ?? AddressZero),
        orderType: orderType,
      },
    })

    await kickoffOrderTrackingSfn(
      {
        orderHash: id,
        chainId: chainId,
        orderStatus: ORDER_STATUS.OPEN,
        quoteId: quoteId ?? '',
        orderType,
        stateMachineArn,
      },
      stateMachineArn
    )

    return {
      statusCode: 201,
      body: { hash: id },
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
