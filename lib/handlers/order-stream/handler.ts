import { DynamoDBRecord } from 'aws-lambda'
import axios from 'axios'
import Logger from 'bunyan'
import Joi from 'joi'
import { logAndThrowError } from '../../util/errors'
import * as fillerWebhooks from '../../util/filler-webhook-urls.json'
import { DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'
import { OrderStreamInputJoi } from './schema'

export class OrderStreamHandler extends DynamoStreamLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<void> {
    const {
      requestInjected: { log, event },
    } = input

    try {
      for (const record of event.Records) {
        await this.handleRecord(record, log)
      }
    } catch (e: unknown) {
      logAndThrowError(e instanceof Error ? { errorCode: e.message } : {}, 'Unexpected error in handler.', log)
    }
  }

  private async handleRecord(record: DynamoDBRecord, log: Logger): Promise<void> {
    try {
      const newOrder = record?.dynamodb?.NewImage
      const fillerAddress = newOrder?.filler?.S

      if (!fillerAddress || !Object.keys(fillerWebhooks).includes(fillerAddress)) {
        throw new Error('There is no valid filler address for this new record.')
      }

      const url = (fillerWebhooks as any)[fillerAddress].url

      const response = await axios.post(url, {
        orderHash: newOrder.orderHash.S,
        createdAt: newOrder.createdAt.N,
        signature: newOrder.signature.S,
        offerer: newOrder.offerer.S,
        orderStatus: newOrder.orderStatus.S,
        encodedOrder: newOrder.encodedOrder.S,
      })

      if (!response || response.status < 200 || response.status > 202) {
        throw new Error('Order recipient did not return an OK status.')
      }
      log.info({ record, response }, 'Success: New order sent to filler webhook.')
    } catch (e: unknown) {
      logAndThrowError(e instanceof Error ? { errorCode: e.message } : {}, 'Error sending new order to filler.', log)
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return OrderStreamInputJoi
  }
}
