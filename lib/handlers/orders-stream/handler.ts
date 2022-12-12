import { DynamoDBStreamEvent } from 'aws-lambda'
import Joi from 'joi'
import { DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'

export const ordersStreamLambda = (event: DynamoDBStreamEvent) => {
  event.Records.forEach((record) => {
    console.log(record)
  })
}

export class OrdersStreamLambda extends DynamoStreamLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
    // }): Promise<DynamoStreamInputOutput> {
  }): Promise<any> {
    try {
      const {
        requestInjected: { log, event },
      } = input
      console.log('event: ', event)

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      event.Records.forEach((record: any) => {
        console.log(record)
      })

      return 0
    } catch (e: unknown) {
      // TODO: differentiate between input errors and add logging if unknown is not type Error
      return {
        statusCode: 500,
        ...(e instanceof Error && { errorCode: e.message }),
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return null
  }
}
