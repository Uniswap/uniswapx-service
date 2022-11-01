import Joi from 'joi'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { PostOrderRequestBodyJoi, PostOrderRequestBody, PostOrderResponseJoi, PostOrderResponse } from './schema/index'
import { OrderEntity, ORDER_STATUS } from '../../entities/Order'
import { DynamoOrdersRepository } from '../../repositories/orders-repository'
import { DynamoDB } from 'aws-sdk'

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
      containerInjected: { dbInterface }
    } = params

    try {
      const { encodedOrder, signature } = requestBody!
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
        reactor
      }

      // Insert Order into db
      dbInterface.putOrderAndUpdateNonceTransaction(order)
      // Insert Order into db
      try {
        const put = await dynamoClient
          .put({
            TableName: 'Orders',
            Item: {
              orderHash,
              orderStatus: ORDER_STATUS.UNVERIFIED,
              encodedOrder,
              signature,
              deadline,
              offerer,
              sellToken,
              sellAmount,
              startTime
            },
          })
          .promise()
        log.info(`Successfully inserted Order into DynamoDb: ${put.$response.requestId}. Kicking off state machine`)
      } catch (err) {
        throw new Error(`Failed to insert Order into DynamoDb: ${err}`)
      }

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
