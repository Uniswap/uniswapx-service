import { DutchLimitOrder, parseOrder } from 'gouda-sdk'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import FieldValidator from '../../util/field-validator'
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
      containerInjected: { dbInterface },
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
    const orderHash = decodedOrder.hash().toLowerCase()

    // Offchain Validation

    // Order could not possibly be inserted into db, queried,
    // and filled all within one second
    if (decodedOrder.info.deadline < 1 + new Date().getTime() / 1000) {
      return {
        statusCode: 400,
        errorCode: 'Invalid deadline',
      }
    }

    if (decodedOrder.info.startTime > decodedOrder.info.deadline) {
      return {
        statusCode: 400,
        errorCode: 'Invalid startTime',
      }
    }

    if (decodedOrder.info.nonce.lt(0)) {
      return {
        statusCode: 400,
        errorCode: 'Invalid nonce',
      }
    }

    if (FieldValidator.isValidEthAddress().validate(decodedOrder.info.offerer).error) {
      return {
        statusCode: 400,
        errorCode: 'Invalid offerer',
      }
    }

    if (FieldValidator.isValidEthAddress().validate(decodedOrder.info.reactor).error) {
      return {
        statusCode: 400,
        errorCode: 'Invalid reactor',
      }
    }

    // Validate input token and amount
    if (FieldValidator.isValidEthAddress().validate(decodedOrder.info.input.token).error) {
      return {
        statusCode: 400,
        errorCode: 'Invalid token',
      }
    }

    if (decodedOrder.info.input.amount.lte(0)) {
      return {
        statusCode: 400,
        errorCode: 'Invalid amount',
      }
    }

    // Validate outputs
    for (const output of decodedOrder.info.outputs) {
      const { token, recipient, startAmount, endAmount } = output
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          statusCode: 400,
          errorCode: `Invalid output token ${token}`,
        }
      }

      if (FieldValidator.isValidEthAddress().validate(recipient).error) {
        return {
          statusCode: 400,
          errorCode: `Invalid recipient ${recipient}`,
        }
      }

      if (startAmount.lt(0)) {
        return {
          statusCode: 400,
          errorCode: `Invalid startAmount ${startAmount.toString()}`,
        }
      }

      if (endAmount.lt(0)) {
        return {
          statusCode: 400,
          errorCode: `Invalid endAmount ${output.endAmount.toString()}`,
        }
      }
    }
    // End offchain validation

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

    // Insert Order into db
    await dbInterface.putOrderAndUpdateNonceTransaction(order)
    log.info(`Successfully inserted Order with hash ${orderHash} into DynamoDb`)

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
