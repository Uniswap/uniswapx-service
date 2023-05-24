import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { DutchLimitOrder, OrderType, OrderValidation } from '@uniswap/gouda-sdk'
import Logger from 'bunyan'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities'
import { checkDefined } from '../../preconditions/preconditions'
import { formatOrderEntity } from '../../util/order'
import { currentTimestampInSeconds } from '../../util/time'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema'

export const MAX_OPEN_ORDERS = 200

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
    log.info({ onchainValidatorByChainId }, 'onchain validators')
    let decodedOrder: DutchLimitOrder

    try {
      decodedOrder = DutchLimitOrder.parse(encodedOrder, chainId) as DutchLimitOrder
    } catch (e: unknown) {
      log.error(e, 'Failed to parse order')
      return {
        statusCode: 400,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }

    const validationResponse = orderValidator.validate(decodedOrder)
    if (!validationResponse.valid) {
      return {
        statusCode: 400,
        errorCode: 'Invalid order',
        detail: validationResponse.errorString,
      }
    }
    // onchain validation
    const onchainValidator = onchainValidatorByChainId[chainId]
    if (!onchainValidator) {
      return {
        statusCode: 500,
        detail: `No onchain validator for chain ${chainId}`,
      }
    }
    const validation = await onchainValidator.validate({ order: decodedOrder, signature: signature })
    if (validation != OrderValidation.OK) {
      return {
        statusCode: 400,
        errorCode: 'Invalid order',
        detail: `Onchain validation failed: ${OrderValidation[validation]}`,
      }
    }

    const order: OrderEntity = formatOrderEntity(
      decodedOrder,
      signature,
      OrderType.DutchLimit,
      ORDER_STATUS.UNVERIFIED,
      quoteId
    )
    const id = order.orderHash

    try {
      const orderCount = await dbInterface.countOrdersByOffererAndStatus(order.offerer, ORDER_STATUS.OPEN)
      if (orderCount > MAX_OPEN_ORDERS) {
        log.info(orderCount, `${order.offerer} has too many open orders`)
        return {
          statusCode: 403,
          errorCode: 'TOO_MANY_OPEN_ORDERS',
        }
      }
    } catch (e) {
      log.error(e, `failed to fetch open order count for ${order.offerer}`)
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }

    const stateMachineArn = checkDefined(process.env['STATE_MACHINE_ARN'])

    try {
      await dbInterface.putOrderAndUpdateNonceTransaction(order)
      log.info(`Successfully inserted Order ${id} into DB`)
    } catch (e: unknown) {
      log.error(e, `Failed to insert order ${id} into DB`)
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }
    order.outputs?.forEach((output) => {
      log?.info({
        eventType: 'OrderPosted',
        body: {
          quoteId: order.quoteId,
          createdAt: currentTimestampInSeconds(),
          orderHash: order.orderHash,
          startTime: order.startTime,
          endTime: order.endTime,
          deadline: order.deadline,
          chainId: order.chainId,
          inputStartAmount: order.input?.startAmount,
          inputEndAmount: order.input?.endAmount,
          tokenIn: order.input?.token,
          outputStartAmount: output.startAmount,
          outputEndAmount: output.endAmount,
          tokenOut: output.token,
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
}
