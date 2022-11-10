import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import { APIGLambdaHandler, BaseRInj, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema/index'

export class PostOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  BaseRInj,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  public async handleRequest(
    params: HandleRequestParams<ContainerInjected, BaseRInj, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody: { encodedOrder, signature },
      requestInjected: { log },
      containerInjected: { dbInterface, offchainValidationProvider },
    } = params

    log.info('Handling POST order request', params)
    let decodedOrder: DutchLimitOrder

    try {
      decodedOrder = parseOrder(encodedOrder) as DutchLimitOrder
    } catch (e: unknown) {
      log.error(e, 'Failed to parse encodedOrder')
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }

    const validationResponse = offchainValidationProvider.validate(decodedOrder)
    if (!validationResponse.valid) {
      return {
        statusCode: 400,
        errorCode: 'Order failed off-chain validation',
        detail: validationResponse.errorString,
      }
    }
    const orderHash = decodedOrder.hash().toLowerCase()

    const order: OrderEntity = {
      encodedOrder,
      signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash,
      orderStatus: ORDER_STATUS.UNVERIFIED,
      offerer: decodedOrder.info.offerer.toLowerCase(),
      sellToken: decodedOrder.info.input.token.toLowerCase(),
      sellAmount: decodedOrder.info.input.amount.toString(),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      startTime: decodedOrder.info.startTime,
      // endTime not in the parsed order, so using deadline
      // TODO: get endTime in the right way
      endTime: decodedOrder.info.deadline,
      deadline: decodedOrder.info.deadline,
    }

    try {
      await dbInterface.putOrderAndUpdateNonceTransaction(order)
      log.info(`Successfully inserted Order with hash ${orderHash} into DynamoDb`)
    } catch (e: unknown) {
      log.error(e, 'Failed to insert into dynamodb')
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }

    return {
      statusCode: 201,
      body: { hash: orderHash },
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
}
