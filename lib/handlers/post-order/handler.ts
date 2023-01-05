import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import Logger from 'bunyan'
import { DutchLimitOrder } from 'gouda-sdk'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import { checkDefined } from '../../preconditions/preconditions'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/index'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema/index'

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
      requestBody: { encodedOrder, signature, chainId },
      requestInjected: { log },
      containerInjected: { dbInterface, orderValidator },
    } = params

    log.info('Handling POST order request', params)
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

    const id = decodedOrder.hash().toLowerCase()

    const order: OrderEntity = {
      encodedOrder,
      signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash: id,
      orderStatus: ORDER_STATUS.UNVERIFIED,
      offerer: decodedOrder.info.offerer.toLowerCase(),
      sellToken: decodedOrder.info.input.token.toLowerCase(),
      sellAmount: decodedOrder.info.input.startAmount.toString(),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      startTime: decodedOrder.info.startTime,
      endTime: decodedOrder.info.deadline,
      deadline: decodedOrder.info.deadline,
      // TODO: Replace this with the actual filler address once the gouda SDK supports this
      filler: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    }

    try {
      const orderCount = await dbInterface.countOrdersByOffererAndStatus(order.offerer, ORDER_STATUS.OPEN)
      if (orderCount > 50) {
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
      log.info(`uccessfully inserted Order ${id} into DB`)
    } catch (e: unknown) {
      log.error(e, `Failed to insert order ${id} into DB`)
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }
    await this.kickoffOrderTrackingSfn(id, chainId, stateMachineArn, log)
    return {
      statusCode: 201,
      body: { hash: id },
    }
  }

  private async kickoffOrderTrackingSfn(hash: string, chainId: number, stateMachineArn: string, log?: Logger) {
    const region = checkDefined(process.env['REGION'])
    const sfnClient = new SFNClient({ region: region })
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      name: hash,
      input: JSON.stringify({
        orderHash: hash,
        chainId: chainId,
        orderStatus: ORDER_STATUS.UNVERIFIED,
      }),
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
