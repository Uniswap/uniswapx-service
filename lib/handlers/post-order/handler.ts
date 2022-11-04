import { parseOrder, DutchLimitOrder } from 'gouda-sdk'
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
      containerInjected: { dbInterface },
    } = params
    log.info('Handling POST Order request', params)
    try {
      // Cast to DutchLimitOrder so that we can get the sellToken field
      // input.token does not exist on iOrder
      const decodedOrder = parseOrder(encodedOrder) as DutchLimitOrder
      const orderHash = decodedOrder.hash().toLowerCase()
      const { deadline, offerer, reactor, startTime, input: {token, amount}, nonce } = decodedOrder.info

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

      // Order could not possibly be inserted into db, queried,
      // and filled all within one second
      if (deadline < 1 + new Date().getTime() / 1000) {
        return {
          statusCode: 400,
          errorCode: 'Invalid deadline',
        }
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
