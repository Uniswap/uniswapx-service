import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { DynamoStreamInputValidationError, InjectionError } from '../../util/errors'
import { BaseInjector, BaseLambdaHandler, BaseRInj } from './base'

export type BatchFailureResponse = {
  batchItemFailures: {
    itemIdentifier: string | undefined
  }[]
}

export type DynamoStreamHandler = (event: DynamoDBStreamEvent) => Promise<BatchFailureResponse>

/*
 * Injector base class for DynamoDB streams.
 *
 * All external dependencies needed in the lambda should be fetched
 * in this class and then will get injected into the handler. This
 * includes stuff like logging, db interfaces, etc.
 */
export abstract class DynamoStreamInjector<CInj, RInj extends BaseRInj> extends BaseInjector<CInj> {
  public constructor(protected injectorName: string) {
    super(injectorName)
  }

  public abstract getRequestInjected(containerInjected: CInj, event: DynamoDBStreamEvent, log: Logger): Promise<RInj>
}

/*
 * Handler base class for DynamoDB streams.
 *
 * DynamoDB streams will trigger this handler for new stream events
 * that fit the filter pattern in the lambda stack. The handler will
 * receieve a stream event and then parse the batched records to
 * perform some action.
 */
export abstract class DynamoStreamLambdaHandler<CInj, RInj extends BaseRInj> extends BaseLambdaHandler<
  DynamoStreamHandler,
  { containerInjected: CInj; requestInjected: RInj },
  BatchFailureResponse
> {
  protected abstract inputSchema(): Joi.ObjectSchema | null

  constructor(handlerName: string, private readonly injectorPromise: Promise<DynamoStreamInjector<CInj, RInj>>) {
    super(handlerName)
  }

  get handler(): DynamoStreamHandler {
    return async (event: DynamoDBStreamEvent): Promise<BatchFailureResponse> => {
      const handler = this.buildHandler()
      return await handler(event)
    }
  }

  /*
   * This function instantiates the logger, validates the stream event and
   * fetches the injected data. Once it has passed all these steps it will
   * call the handler with this data.
   */
  protected buildHandler(): DynamoStreamHandler {
    return async (streamInput: DynamoDBStreamEvent): Promise<BatchFailureResponse> => {
      const log: Logger = bunyan.createLogger({
        name: this.handlerName,
        serializers: bunyan.stdSerializers,
        level: process.env.NODE_ENV == 'test' ? bunyan.FATAL + 1 : bunyan.INFO,
      })

      await this.validateInput(streamInput, log)

      const injector = await this.injectorPromise

      const containerInjected = injector.getContainerInjected()

      let requestInjected: RInj
      try {
        requestInjected = await injector.getRequestInjected(containerInjected, streamInput, log)
      } catch (err) {
        log.error({ err, streamInput }, 'Unexpected error building request injected.')
        throw new InjectionError(`Unexpected error building request injected:\n${err}`)
      }

      return await this.handleRequest({ containerInjected, requestInjected })
    }
  }

  private async validateInput(input: DynamoDBStreamEvent, log: Logger): Promise<DynamoDBStreamEvent> {
    const schema = this.inputSchema()

    if (schema) {
      const inputValidation = schema.validate(input, {
        allowUnknown: true,
        stripUnknown: true,
      })
      if (inputValidation.error) {
        log.info({ inputValidation }, 'Input failed validation')
        throw new DynamoStreamInputValidationError(inputValidation.error.message)
      }
    }
    return input
  }

  public abstract handleRequest(input: {
    containerInjected: CInj
    requestInjected: RInj
  }): Promise<BatchFailureResponse>
}
