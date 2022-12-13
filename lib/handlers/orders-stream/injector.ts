import { default as bunyan, default as Logger } from 'bunyan'
import { DynamoStreamInjector, DynamoStreamInputOutput } from '../base/dynamo-stream-handler'
import { BaseRInj } from '../base/index'

export interface RequestInjected extends BaseRInj {
  event: DynamoStreamInputOutput
}

export interface ContainerInjected {
  [n: string]: never
}

export class OrdersStreamInjector extends DynamoStreamInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {}
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    event: DynamoStreamInputOutput,
    log: Logger
  ): Promise<RequestInjected> {
    console.log('event in injector: ', event)

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
