import axios, { AxiosResponse } from 'axios'
import Joi from 'joi'
import { eventRecordToOrder } from '../../util/order'
import { BatchFailureResponse, DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'
import { OrderNotificationInputJoi } from './schema'
import { metrics } from '../../util/metrics'

const WEBHOOK_TIMEOUT_MS = 500

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

        const registeredEndpoints = await webhookProvider.getEndpoints({
          offerer: newOrder.swapper,
          orderStatus: newOrder.orderStatus,
          filler: newOrder.filler,
        })

        const requests: Promise<AxiosResponse>[] = registeredEndpoints.map((endpoint) =>
          axios.post(
            endpoint.url,
            {
              orderHash: newOrder.orderHash,
              createdAt: newOrder.createdAt,
              signature: newOrder.signature,
              offerer: newOrder.swapper,
              orderStatus: newOrder.orderStatus,
              encodedOrder: newOrder.encodedOrder,
              chainId: newOrder.chainId,
              ...(newOrder.quoteId && { quoteId: newOrder.quoteId }),
              ...(newOrder.filler && { filler: newOrder.filler }),
            },
            {
              timeout: WEBHOOK_TIMEOUT_MS,
              headers: { ...endpoint.headers },
            }
          )
        )

        // send all notifications and track the failed requests
        // note we try each webhook once and only once, so guarantee to MM is _at most once_
        const failedRequests: PromiseSettledResult<AxiosResponse>[] = []
        const results = await Promise.allSettled(requests)
        results.forEach((result) =>
          result.status == 'fulfilled' && result?.value?.status >= 200 && result?.value?.status <= 202
            ? log.info({ result: result.value }, 'Success: New order record sent to registered webhook.')
            : failedRequests.push(result)
        )

        if (failedRequests.length > 0) {
          log.error({ failedRequests: failedRequests }, 'Error: Failed to notify registered webhooks.')
          failedRecords.push({ itemIdentifier: record.dynamodb?.SequenceNumber })
        }
      } catch (e: unknown) {
        log.error(e instanceof Error ? e.message : e, 'Unexpected failure in handler.')
        failedRecords.push({ itemIdentifier: record.dynamodb?.SequenceNumber })
      }
    }

    metrics.putMetric('OrderNotificationsSent', event.Records.length - failedRecords.length)

    // this lambda will be invoked again with the failed records
    return { batchItemFailures: failedRecords }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return OrderNotificationInputJoi
  }
}
