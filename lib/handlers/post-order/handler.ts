import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { DutchOrder, OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Logger from 'bunyan'
import Joi from 'joi'

import { OrderEntity, ORDER_STATUS } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { metrics } from '../../util/metrics'
import { formatOrderEntity } from '../../util/order'
import { currentTimestampInSeconds } from '../../util/time'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

type OrderTrackingSfnInput = {
  orderHash: string
  chainId: number
  orderStatus: ORDER_STATUS
  quoteId: string
}

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
      containerInjected: { dbInterface, orderValidator, onchainValidatorByChainId },
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
    order.outputs?.forEach((output) => {
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
          outputStartAmount: output.startAmount,
          outputEndAmount: output.endAmount,
          tokenOut: output.token,
          filler: getAddress(order.filler ?? AddressZero),
        },
      })
    })

    await this.kickoffOrderTrackingSfn(
      { orderHash: id, chainId: chainId, orderStatus: ORDER_STATUS.OPEN, quoteId: quoteId ?? '' },
      stateMachineArn,
      log
    )
    return {
      statusCode: 201,
      body: { hash: id },
    }
  }

  private async kickoffOrderTrackingSfn(sfnInput: OrderTrackingSfnInput, stateMachineArn: string, log?: Logger) {
    const region = checkDefined(process.env['REGION'])
    const sfnClient = new SFNClient({ region: region })
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      input: JSON.stringify(sfnInput),
      name: sfnInput.orderHash,
    })
    log?.info(startExecutionCommand, 'Starting state machine execution')
    await sfnClient.send(startExecutionCommand)
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

const HIGH_MAX_OPEN_ORDERS_SWAPPERS: string[] = [
  // canaries
  '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
  '0xf82af5cd1f0d24cdcf9d35875107d5e43ce9b3d0',
  '0xa50dac48d61bb52b339c7ef0dcefa7688338d00a',
  '0x5b062dc717983be67f7e1b44a6557d7da7d399bd',
  // integ tests
  '0xe001e6f6879c07b9ac24291a490f2795106d348c',
  '0x8943ea25bbfe135450315ab8678f2f79559f4630',
]
export const DEFAULT_MAX_OPEN_ORDERS = 5
export const HIGH_MAX_OPEN_ORDERS = 200

// return the number of open orders the given offerer is allowed to have at a time
function getMaxOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_ORDERS
}
