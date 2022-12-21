import axios, { AxiosResponse } from 'axios'
import Joi from 'joi'
import { callWithRetry } from '../../util/network-requests'
import { eventRecordToOrder } from '../../util/order'
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
        const newOrder = eventRecordToOrder(record)

        const registeredEndpoints = webhookProvider.getEndpoints({
          offerer: newOrder.offerer,
          orderStatus: newOrder.orderStatus,
          filler: newOrder.filler,
          sellToken: newOrder.sellToken,
        })

        // build webhook requests with retries and timeouts
        const requests: Promise<AxiosResponse>[] = []
        for (const endpoint of registeredEndpoints) {
          const requestWithTimeout = async () =>
            await axios.post(
              endpoint,
              {
                orderHash: newOrder.orderHash,
                createdAt: newOrder.createdAt,
                signature: newOrder.signature,
                offerer: newOrder.offerer,
                orderStatus: newOrder.orderStatus,
                encodedOrder: newOrder.encodedOrder,
              },
              { timeout: 5000 }
            )
          requests.push(callWithRetry(requestWithTimeout))
        }

        // send all notifications and track the failed requests
        const failedRequests: PromiseSettledResult<AxiosResponse>[] = []
        const results = await Promise.allSettled(requests)
        results.forEach((result) =>
          result.status == 'fulfilled' && result?.value?.status >= 200 && result?.value?.status <= 202
            ? log.info({ result: result.value }, 'Success: New order sent to registered webhook.')
            : failedRequests.push(result)
        )

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
