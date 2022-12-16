import axios, { AxiosResponse } from 'axios'
import Joi from 'joi'
import { ORDER_STATUS } from '../../entities'
import { rejectAfterDelay } from '../../util/errors'
import { callWithRetry } from '../../util/network-requests'
import { BatchFailureResponse, DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'
import { OrderNotificationInputJoi } from './schema'

export class OrderNotificationHandler extends DynamoStreamLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<BatchFailureResponse> {
    const {
      requestInjected: { log, event },
      containerInjected: { webhookProvider },
    } = input

    const failedRecords = []
    for (const record of event.Records) {
      try {
        const newOrder = record?.dynamodb?.NewImage
        if (!newOrder) {
          throw new Error('There is no new order.')
        }

        const registeredEndpoints = webhookProvider.getEndpoints({
          offerer: newOrder.offerer.S as string,
          orderStatus: newOrder.orderStatus.S as ORDER_STATUS,
          filler: newOrder.filler.S as string,
          sellToken: newOrder.sellToken.S as string,
        })

        // build webhook requests with retries and timeouts
        const requests: Promise<AxiosResponse>[] = []
        for (const endpoint of registeredEndpoints) {
          requests.push(
            callWithRetry(() => {
              return Promise.race([
                axios.post(endpoint, {
                  orderHash: newOrder.orderHash.S,
                  createdAt: newOrder.createdAt.N,
                  signature: newOrder.signature.S,
                  offerer: newOrder.offerer.S,
                  orderStatus: newOrder.orderStatus.S,
                  encodedOrder: newOrder.encodedOrder.S,
                }),
                rejectAfterDelay(5000),
              ])
            })
          )
        }

        // send all notifications and track the failed requests
        const failedRequests: PromiseSettledResult<AxiosResponse>[] = []
        await Promise.allSettled(requests).then((results) => {
          for (const result of results) {
            if (result.status == 'fulfilled' && result?.value?.status >= 200 && result?.value?.status <= 202) {
              log.info({ result: result.value }, 'Success: New order sent to registered webhook.')
            } else {
              failedRequests.push(result)
            }
          }
        })

        if (failedRequests.length > 0) {
          log.error({ failedRequests: failedRequests }, 'Error: Failed to notify registered webhooks.')
          failedRecords.push({ itemIdentifier: record.dynamodb?.SequenceNumber })
        }
      } catch (e: unknown) {
        log.error({ e }, 'Unexpected failure in handler.')
        failedRecords.push({ itemIdentifier: record.dynamodb?.SequenceNumber })
      }
    }

    // this lambda will be invoked again with the failed records
    return { batchItemFailures: failedRecords }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return OrderNotificationInputJoi
  }
}
