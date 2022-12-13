import { DynamoDBRecord } from 'aws-lambda'
import axios from 'axios'
import Logger from 'bunyan'
import Joi from 'joi'
import * as fillerWebhooks from '../../util/filler-webhook-urls.json'
import { DynamoStreamLambdaHandler } from '../base/dynamo-stream-handler'
import { ContainerInjected, RequestInjected } from './injector'

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
        await this.handleEvent(record, log)
      }
    } catch (e: unknown) {
      log.error({ e }, 'Unexpected error in handler.')
    }
  }

  private async handleEvent(record: DynamoDBRecord, log: Logger): Promise<void> {
    try {
      const newOrder = record?.dynamodb?.NewImage
      const fillerAddress = newOrder?.filler?.S

      if (!fillerAddress) {
        throw new Error('There is no filler address for this new record.')
      }

      const url = (fillerWebhooks as any)[fillerAddress].url
      const option = {
        method: 'post',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
        },
        data: JSON.stringify({
          orderHash: newOrder.orderHash.S,
          createdAt: newOrder.createdAt.N,
          signature: newOrder.signature.S,
          offerer: newOrder.offerer.S,
          orderStatus: newOrder.orderStatus.S,
          encodedOrder: newOrder.encodedOrder.S,
        }),
        url,
      }

      const response = await axios(option)
      log.info({ record, response }, 'Success: New order posted to filler webhook.')
    } catch (e: unknown) {
      log.error({ e }, 'Error posting new order to filler webhook.')
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return null
  }
}
