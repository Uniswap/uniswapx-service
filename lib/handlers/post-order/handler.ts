import Joi from 'joi'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { PostOrderRequestBodyJoi, PostOrderRequestBody, PostOrderResponseJoi, PostOrderResponse } from './schema/index'
import { JsonRpcProvider } from '@ethersproject/providers'
import { ORDER_STATUS } from '../types/order'
import { parseOrder } from 'gouda-sdk'
import { StepFunctions, DynamoDB } from 'aws-sdk'

const stepfunctions = new StepFunctions()

export class PostOrderHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  PostOrderRequestBody,
  void,
  PostOrderResponse
> {
  public async handleRequest(
    params: HandleRequestParams<ContainerInjected, RequestInjected, PostOrderRequestBody, void>
  ): Promise<Response<any> | ErrorResponse> {
    const {
      requestBody,
      requestInjected: { log, deadline, offerer, sellToken },
    } = params

    try {
      const { encodedOrder, signature, chainId } = requestBody!

      const RPC = process.env[`RPC_${chainId}`]!
      log.info(process.env)
      const hash = parseOrder(encodedOrder).hash()

      const provider = new JsonRpcProvider(RPC)
      const startBlockNumber = await provider.getBlockNumber()

      const dynamoClient = new DynamoDB.DocumentClient()
      // Add Order to db
      try {
        const put = await dynamoClient
          .put({
            TableName: 'Orders',
            Item: {
              orderHash: hash,
              // order is not validated on chain yet
              orderStatus: ORDER_STATUS.UNVERIFIED,
              encodedOrder,
              signature,
              deadline,
              offerer,
              sellToken,
            },
          })
          .promise()
        log.info(`Successfully inserted Order into DynamoDb: ${put.$response.requestId}. Kicking off state machine`)
      } catch (err) {
        throw new Error(`Failed to insert Order into DynamoDb: ${err}`)
      }

      await stepfunctions
        .startExecution(
          {
            stateMachineArn: process.env[`STATE_MACHINE_ARN`]!,
            name: `${hash}`,
            input: JSON.stringify({
              encodedOrder,
              signature,
              startBlockNumber: startBlockNumber - 1,
              chainId,
              orderHash: hash,
            }),
          },
          (err, resp) => {
            if (err) {
              log.info({ encodedOrder, signature, chainId }, err)
              throw new Error(`Failed to kick off state machine: ${err}`)
            }
            log.info(`Successfully kicked off state machine: ${resp.executionArn}`)
          }
        )
        .promise()

      return {
        statusCode: 200,
        body: { hash },
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
