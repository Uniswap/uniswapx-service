import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { WebhookProvider } from '../../providers/base'
import { DynamoStreamInjector } from '../base/dynamo-stream-handler'
import { BaseRInj } from '../base/index'
import { WEBHOOK_CONFIG_BUCKET, PRODUCTION_WEBHOOK_CONFIG_KEY } from '../../util/constants'

export interface RequestInjected extends BaseRInj {
  event: DynamoDBStreamEvent
}

export interface ContainerInjected {
  webhookProvider: WebhookProvider
}

export class OrderNotificationInjector extends DynamoStreamInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const stage = process.env['stage'];
    const webhookProvider = new S3WebhookConfigurationProvider(
      `${WEBHOOK_CONFIG_BUCKET}-${stage}`,
      PRODUCTION_WEBHOOK_CONFIG_KEY
    );
    return { webhookProvider }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    event: DynamoDBStreamEvent,
    log: Logger
  ): Promise<RequestInjected> {
    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
    })

    return {
      log,
      event: event,
    }
  }
}
