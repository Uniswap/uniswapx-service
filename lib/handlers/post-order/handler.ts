import { StepFunctions } from 'aws-sdk'
import Logger from 'bunyan'
import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import { APIGLambdaHandler, APIHandleRequestParams, ApiRInj, ErrorResponse, Response } from '../base/handler'
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
      decodedOrder = parseOrder(encodedOrder) as DutchLimitOrder
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
      sellAmount: decodedOrder.info.input.amount.toString(),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      startTime: decodedOrder.info.startTime,
      endTime: decodedOrder.info.deadline,
      deadline: decodedOrder.info.deadline,
    }

    const stateMachineArn = process.env['STATE_MACHINE_ARN']
    if (!stateMachineArn) {
      throw new Error('Missing STATE_MACHINE_ARN env variable')
    }

    try {
      await dbInterface.putOrderAndUpdateNonceTransaction(order)
      await this.kickoffOrderTrackingSfn(id, chainId, stateMachineArn, log)
      log.info(`uccessfully inserted Order ${id} and kicked off order tracking`)
    } catch (e: unknown) {
      log.error(e, `Failed to insert order ${id} and/or kick off order tracking`)
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }

    return {
      statusCode: 201,
      body: { hash: id },
    }
  }

  private async kickoffOrderTrackingSfn(hash: string, chainId: number, stateMachineArn: string, log?: Logger) {
    const sfn = new StepFunctions()
    await sfn
      .startExecution(
        {
          stateMachineArn: stateMachineArn,
          name: hash,
          input: JSON.stringify({
            orderHash: hash,
            chainId: chainId,
            orderStatus: ORDER_STATUS.UNVERIFIED,
          }),
        },
        (err, data) => {
          if (err) {
            log?.error(err, err.stack)
          } else {
            log?.info(data, 'Successfully started state machine')
          }
        }
      )
      .promise()
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
