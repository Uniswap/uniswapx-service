import axios, { AxiosResponse } from 'axios'
import Joi from 'joi'
import { metrics } from '../../util/metrics'
import { eventRecordToOrder } from '../../util/order'
import { BatchFailureResponse, DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'
import { OrderNotificationInputJoi } from './schema'
import { CosignedV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC } from '../constants'
import { Unit } from 'aws-embedded-metrics'
import { ChainId } from '../../util/chain'

const WEBHOOK_TIMEOUT_MS = 200

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

        this.recordOrderTimingMetrics(newOrder, record)

        const getEndpointsStartTime = Date.now()
        const registeredEndpoints = await webhookProvider.getEndpoints({
          offerer: newOrder.swapper,
          orderStatus: newOrder.orderStatus,
          filler: newOrder.filler,
          orderType: newOrder.orderType,
        })
        const getEndpointsDuration = Date.now() - getEndpointsStartTime
        metrics.putMetric('OrderNotificationGetEndpointsDuration', getEndpointsDuration, Unit.Milliseconds)

        log.info({ order: newOrder, registeredEndpoints }, 'Sending order to registered webhooks.')

        // Randomize the order to prevent any filler from having a consistent advantage
        const shuffledEndpoints = [...registeredEndpoints].sort(() => Math.random())
        const requests: Promise<AxiosResponse>[] = shuffledEndpoints.map((endpoint) =>
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
              ...(newOrder.orderType && { type: newOrder.orderType }),
              ...(newOrder.quoteId && { quoteId: newOrder.quoteId }),
              ...(newOrder.filler && { filler: newOrder.filler }),
              notifiedAt: Math.floor(Date.now() / 1000), // Fillers can deduce notification latency
            },
            {
              timeout: WEBHOOK_TIMEOUT_MS,
              headers: { ...endpoint.headers },
            }
          )
        )

        // we send to each webhook only once but log which ones failed
        const results = await Promise.allSettled(requests)
        const failedWebhooks: string[] = []

        results.forEach((result, index) => {
          metrics.putMetric(`OrderNotificationAttempt-chain-${newOrder.chainId}`, 1)
          if (result.status == 'fulfilled' && result?.value?.status >= 200 && result?.value?.status <= 202) {
            delete result.value.request
            log.info(
              { result: result.value },
              `Success: New order record sent to registered webhook ${registeredEndpoints[index].url}.`
            )
            metrics.putMetric(`OrderNotificationSendSuccess-chain-${newOrder.chainId}`, 1)
          } else {
            failedWebhooks.push(registeredEndpoints[index].url)
            metrics.putMetric(`OrderNotificationSendFailure-chain-${newOrder.chainId}`, 1)
          }
        })

        if (failedWebhooks.length > 0) {
          log.error({ failedWebhooks }, 'Error: Failed to notify registered webhooks.')
          // No longer retry webhook delivery failures
        }
      } catch (e: unknown) {
        log.error(e instanceof Error ? e.message : e, 'Unexpected failure in handler.')
        failedRecords.push({ itemIdentifier: record.dynamodb?.SequenceNumber })
        metrics.putMetric('OrderNotificationHandlerFailure', 1)
      }
    }

    // Only unexpected handler failures will cause record retries
    return { batchItemFailures: failedRecords }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return OrderNotificationInputJoi
  }

  private recordOrderTimingMetrics(newOrder: any, record: any): void {
    switch (newOrder.orderType) {
      case OrderType.Dutch_V2:
        this.recordDutchV2TimingMetrics(newOrder, record)
        break
      case OrderType.Dutch_V3:
        this.recordDutchV3TimingMetrics(newOrder, record)
        break
      case OrderType.Priority:
        this.recordPriorityTimingMetrics(newOrder, record)
        break
      default:
        break
    }
  }

  private recordDutchV2TimingMetrics(newOrder: any, record: any): void {
    const order = CosignedV2DutchOrder.parse(newOrder.encodedOrder, newOrder.chainId)
    const decayStartTime = order.info.cosignerData.decayStartTime
    const currentTime = Math.floor(Date.now() / 1000) // Convert to seconds
    const decayTimeDifference = Number(decayStartTime) - currentTime

    if (record.dynamodb && record.dynamodb.ApproximateCreationDateTime) {
      const recordTimeDifference = record.dynamodb.ApproximateCreationDateTime - currentTime
      const staleRecordMetricName = `NotificationRecordStaleness-chain-${newOrder.chainId.toString()}`
      metrics.putMetric(staleRecordMetricName, recordTimeDifference)
    }

    // GPA currently sets mainnet decay start to 24 secs into the future
    if (newOrder.chainId == ChainId.MAINNET && decayTimeDifference > DUTCHV2_ORDER_LATENCY_THRESHOLD_SEC) {
      const staleOrderMetricName = `NotificationStaleOrder-chain-${newOrder.chainId.toString()}`
      metrics.putMetric(staleOrderMetricName, 1, Unit.Count)
    }

    const orderStalenessMetricName = `NotificationOrderStaleness-chain-${newOrder.chainId.toString()}`
    metrics.putMetric(orderStalenessMetricName, decayTimeDifference)
  }

  private recordDutchV3TimingMetrics(newOrder: any, record: any): void {
    // Can't get decay delay without incurring the cost of fetching current block number
    if (record.dynamodb && record.dynamodb.ApproximateCreationDateTime) {
      const currentTime = Math.floor(Date.now() / 1000)
      const recordTimeDifference = record.dynamodb.ApproximateCreationDateTime - currentTime
      const staleRecordMetricName = `NotificationRecordStaleness-chain-${newOrder.chainId.toString()}`
      metrics.putMetric(staleRecordMetricName, recordTimeDifference)
    }
  }

  private recordPriorityTimingMetrics(newOrder: any, record: any): void {
    if (record.dynamodb && record.dynamodb.ApproximateCreationDateTime) {
      const currentTime = Math.floor(Date.now() / 1000)
      const recordTimeDifference = record.dynamodb.ApproximateCreationDateTime - currentTime
      const staleRecordMetricName = `NotificationRecordStaleness-chain-${newOrder.chainId.toString()}`
      metrics.putMetric(staleRecordMetricName, recordTimeDifference)
    }
  }
}
