import { DynamoDB } from 'aws-sdk'
import Joi from 'joi'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { PostOrderRequestBody, PostOrderRequestBodyJoi, PostOrderResponse, PostOrderResponseJoi } from './schema/index'

export class PostOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  public async handleRequest(
    params: HandleRequestParams<ContainerInjected, RequestInjected, PostOrderRequestBody, void>
  ): Promise<Response<PostOrderResponse> | ErrorResponse> {
    const {
      requestBody,
      requestInjected: { log, deadline, offerer, sellToken, sellAmount, nonce, orderHash, reactor, startTime },
      containerInjected: { dbInterface },
    } = params
    log.info({ log, deadline, offerer, sellToken, sellAmount, nonce, orderHash, reactor, startTime })

    try {
      const { encodedOrder, signature } = requestBody
      const dynamoClient = new DynamoDB.DocumentClient()
      DynamoOrdersRepository.initialize(dynamoClient)

      const order: OrderEntity = {
        encodedOrder,
        signature,
        nonce,
        orderHash,
        orderStatus: ORDER_STATUS.UNVERIFIED,
        offerer,
        sellToken,
        sellAmount,
        reactor,
        startTime,
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
    } catch (e: any) {
      log.error(e, 'Failed to handle POST Order')
      return {
        statusCode: 500,
        errorCode: e.message,
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
