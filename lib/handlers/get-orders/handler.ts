import Joi from '@hapi/joi'
import { DynamoDB } from 'aws-sdk'
import { APIGLambdaHandler, ErrorResponse, HandleRequestParams, Response } from '../base/handler'
import { getOrders } from '../db-requests'
import { Order, ORDER_STATUS } from '../types/order'
import { ContainerInjected, RequestInjected } from './injector'
import { GetOrdersQueryParams, GetOrdersQueryParamsJoi, GetOrdersResponse, GetOrdersResponseJoi } from './schema/index'

export class GetOrdersHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetOrdersQueryParams,
  GetOrdersResponse
> {
  public async handleRequest(
    params: HandleRequestParams<ContainerInjected, RequestInjected, void, GetOrdersQueryParams>
  ): Promise<Response<any> | ErrorResponse> {
    const {
      requestInjected: { limit, orderStatus, orderHash, offerer, sellToken, chainId, buyToken, deadline, log },
    } = params
    const dynamoClient = new DynamoDB.DocumentClient()
    const dbParams = {
      RequestItems: {
        Orders: [
          {
            PutRequest: {
              Item: {
                orderHash: '0xdeadbeef1',
                // order is not validated on chain yet
                orderStatus: ORDER_STATUS.UNVERIFIED,
                encodedOrder: '0xencodedorder1',
                signature: '0xsignature1',
                offerer: '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2681',
                sellToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                deadline: 100,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                orderHash: '0xdeadbeef2',
                // order is not validated on chain yet
                orderStatus: ORDER_STATUS.UNVERIFIED,
                encodedOrder: '0xencodedorder2',
                signature: '0xsignature2',
                offerer: '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2681',
                sellToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
                deadline: 50,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                orderHash: '0xdeadbeef3',
                // order is not validated on chain yet
                orderStatus: ORDER_STATUS.UNVERIFIED,
                encodedOrder: '0xencodedorder3',
                signature: '0xsignature3',
                offerer: '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682',
                sellToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
                deadline: 25,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                orderHash: '0xdeadbeef4',
                // order is not validated on chain yet
                orderStatus: ORDER_STATUS.OPEN,
                encodedOrder: '0xencodedorder4',
                signature: '0xsignature4',
                offerer: '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682',
                sellToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                deadline: 20,
              },
            },
          },
        ],
      },
    }
    try {
      await dynamoClient.batchWrite(dbParams).promise()
      const orders: Order[] = await getOrders(
        limit,
        { orderStatus, orderHash, offerer, sellToken, chainId, buyToken, deadline },
        log
      )

      return {
        statusCode: 200,
        body: { orders: orders },
      }
    } catch (e: any) {
      return {
        // TODO: differentiate between input errors
        statusCode: 500,
        errorCode: e.message,
      }
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return GetOrdersQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetOrdersResponseJoi
  }
}
