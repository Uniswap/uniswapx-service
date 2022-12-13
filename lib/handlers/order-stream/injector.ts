import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { DynamoStreamInjector } from '../base/dynamo-stream-handler'
import { BaseRInj } from '../base/index'

export interface RequestInjected extends BaseRInj {
  event: DynamoDBStreamEvent
}

export interface ContainerInjected {
  [n: string]: never
}

export class OrderStreamInjector extends DynamoStreamInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
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
