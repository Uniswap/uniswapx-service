import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { JsonWebhookProvider } from '../../providers/WebhookProvider'
import * as fillerWebhooks from '../../util/filler-webhook-urls.json'
import { DynamoStreamInjector } from '../base/dynamo-stream-handler'
import { BaseRInj } from '../base/index'

export interface RequestInjected extends BaseRInj {
  event: DynamoDBStreamEvent
}

export interface ContainerInjected {
  webhookProvider: JsonWebhookProvider
}

export class OrderStreamInjector extends DynamoStreamInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return { webhookProvider: JsonWebhookProvider.create(fillerWebhooks) }
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
