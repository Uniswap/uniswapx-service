import axios, { AxiosResponse } from 'axios'
import Joi from 'joi'
import { metrics } from '../../util/metrics'
import { eventRecordToOrder } from '../../util/order'
import { WebhookOrderData, ExclusiveFillerWebhookOrder, WebhookLogger, WebhookProviderInterface } from './types'
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

        // Convert to standard webhook format (map swapper -> offerer)
        const webhookOrderData: WebhookOrderData = {
          ...newOrder,
          offerer: newOrder.swapper
        }
        await sendWebhookNotifications(registeredEndpoints, webhookOrderData, log)
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

/**
 * Send webhook notifications to all provided endpoints
 * Extracted from OrderNotificationHandler for reuse in immediate notifications
 */
export async function sendWebhookNotifications(
  endpoints: Array<{ url: string; headers?: { [key: string]: string } }>,
  order: WebhookOrderData,
  logger: WebhookLogger
): Promise<void> {
  // Randomize the order to prevent any filler from having a consistent advantage
  const shuffledEndpoints = [...endpoints].sort(() => Math.random())
  const requests: Promise<AxiosResponse>[] = shuffledEndpoints.map((endpoint) =>
    axios.post(
      endpoint.url,
      {
        orderHash: order.orderHash,
        createdAt: order.createdAt,
        signature: order.signature,
        offerer: order.offerer,
        orderStatus: order.orderStatus,
        encodedOrder: order.encodedOrder,
        chainId: order.chainId,
        ...(order.orderType && { type: order.orderType }),
        ...(order.quoteId && { quoteId: order.quoteId }),
        ...(order.filler && { filler: order.filler }),
        notifiedAt: Date.now(), // Fillers can deduce notification latency
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
    metrics.putMetric(`OrderNotificationAttempt-chain-${order.chainId}`, 1)
    if (result.status == 'fulfilled' && result?.value?.status >= 200 && result?.value?.status <= 202) {
      delete result.value.request
      logger.info(
        { result: result.value },
        `Success: New order record sent to registered webhook ${endpoints[index].url}.`
      )
      metrics.putMetric(`OrderNotificationSendSuccess-chain-${order.chainId}`, 1)
    } else {
      failedWebhooks.push(endpoints[index].url)
      metrics.putMetric(`OrderNotificationSendFailure-chain-${order.chainId}`, 1)
    }
  })

  if (failedWebhooks.length > 0) {
    logger.error({ failedWebhooks }, 'Error: Failed to notify registered webhooks.')
    // No longer retry webhook delivery failures
  }
}

/**
 * Send immediate webhook notification to exclusive filler only
 * Called synchronously from post-order handler to minimize latency for exclusive fillers
 * 
 * @param orderEntity - Order entity with validated exclusive filler (caller must ensure filler is non-zero address)
 * @param orderType - Type of the order
 * @param webhookProvider - Provider for webhook endpoints
 * @param logger - Logger instance
 */
export async function sendImmediateExclusiveFillerNotification(
  orderEntity: ExclusiveFillerWebhookOrder,
  orderType: string,
  webhookProvider: WebhookProviderInterface,
  logger: WebhookLogger
): Promise<void> {

  try {
    const startTime = Date.now()
    
    // Get endpoints specifically for the exclusive filler
    const exclusiveFillerEndpoints = await webhookProvider.getEndpoints({
      offerer: orderEntity.offerer,
      orderStatus: orderEntity.orderStatus,
      filler: orderEntity.filler,
      orderType,
    })

    if (exclusiveFillerEndpoints.length === 0) {
      return
    }

    logger.info(
      { 
        orderHash: orderEntity.orderHash, 
        filler: orderEntity.filler, 
        endpointCount: exclusiveFillerEndpoints.length 
      },
      'Sending immediate webhook notification to exclusive filler'
    )

    await sendWebhookNotifications(
      exclusiveFillerEndpoints,
      {
        ...orderEntity,
        orderType,
      },
      logger
    )

    const duration = Date.now() - startTime
    metrics.putMetric(`ImmediateNotificationDuration-chain-${orderEntity.chainId}`, duration, Unit.Milliseconds)
    metrics.putMetric(`ImmediateNotificationAttempt-chain-${orderEntity.chainId}`, 1, Unit.Count)

  } catch (error) {
    logger.error(
      { 
        orderHash: orderEntity.orderHash, 
        filler: orderEntity.filler, 
        error 
      },
      'Failed to send immediate webhook notification to exclusive filler'
    )
    metrics.putMetric(`ImmediateNotificationError-chain-${orderEntity.chainId}`, 1, Unit.Count)
    // Don't throw - we don't want webhook failures to break order posting
  }
}
