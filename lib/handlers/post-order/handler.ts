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
    log.info('Handling POST Order request', params)
    try {
      // Cast to DutchLimitOrder so that we can get the sellToken field
      // input.token does not exist on iOrder
      const decodedOrder = parseOrder(encodedOrder) as DutchLimitOrder
      const orderHash = decodedOrder.hash().toLowerCase()
      const {
        deadline,
        offerer,
        reactor,
        startTime,
        input: { token, amount },
        nonce,
        outputs,
      } = decodedOrder.info

      // Offchain Validation

      // Order could not possibly be inserted into db, queried,
      // and filled all within one second
      if (deadline < 1 + new Date().getTime() / 1000) {
        return {
          statusCode: 400,
          errorCode: 'Invalid deadline',
        }
      }

      if (startTime > deadline) {
        return {
          statusCode: 400,
          errorCode: 'Invalid startTime',
        }
      }

      if (nonce.lt(0)) {
        return {
          statusCode: 400,
          errorCode: 'Invalid nonce',
        }
      }

      if (FieldValidator.isValidEthAddress().validate(offerer).error) {
        return {
          statusCode: 400,
          errorCode: 'Invalid offerer',
        }
      }

      if (FieldValidator.isValidEthAddress().validate(reactor).error) {
        return {
          statusCode: 400,
          errorCode: 'Invalid reactor',
        }
      }

      // Validate input token and amount
      if (FieldValidator.isValidEthAddress().validate(token).error) {
        return {
          statusCode: 400,
          errorCode: 'Invalid token'
        }
      }

      if (amount.lte(0)) {
        return {
          statusCode: 400,
          errorCode: 'Invalid amount'
        }
      }

      // Validate outputs
      for (let i = 0; i < outputs.length; i++) {
        const { token, recipient, startAmount, endAmount } = outputs[i]
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
            errorCode: `Invalid endAmount ${outputs[i].endAmount.toString()}`,
          }
        }
      }
      // End offchain validation

      const order: OrderEntity = {
        encodedOrder,
        signature,
        nonce: nonce.toString(),
        orderHash,
        orderStatus: ORDER_STATUS.UNVERIFIED,
        offerer: offerer.toLowerCase(),
        sellToken: token.toLowerCase(),
        sellAmount: amount.toString(),
        reactor: reactor.toLowerCase(),
        startTime,
        // endTime not in the parsed order, so using deadline
        // TODO: get endTime in the right way
        endTime: deadline,
        deadline,
      }

      // Insert Order into db
      await dbInterface.putOrderAndUpdateNonceTransaction(order)
      log.info(`Successfully inserted Order with hash ${orderHash} into DynamoDb`)

      return {
        statusCode: 201,
        body: { hash: orderHash },
      }
    } catch (e: unknown) {
      log.error(e, 'Failed to handle POST Order')
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
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
}
