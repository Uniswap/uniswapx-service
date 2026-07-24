import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { checkDefined } from '../../preconditions/preconditions'
import { DynamoStreamInputValidationError, InjectionError } from '../../util/errors'

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
export abstract class DynamoStreamInjector<CInj, RInj> {
  public containerInjected: CInj | undefined

  public constructor(protected readonly injectorName: string) {
    checkDefined(injectorName, 'Injector name must be defined')
  }

  protected abstract buildContainerInjected(): Promise<CInj>

  public async build() {
    this.containerInjected = await this.buildContainerInjected()
    return this
  }

  public getContainerInjected(): CInj {
    return checkDefined(this.containerInjected, 'Container injected undefined. Must call build() before using.')
  }

  public abstract getRequestInjected(
    containerInjected: CInj,
    event: DynamoDBStreamEvent,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RInj>
}

/*
 * Handler base class for DynamoDB streams.
 *
 * DynamoDB streams will trigger this handler for new stream events
 * that fit the filter pattern in the lambda stack. The handler will
 * receive a stream event and then parse the batched records to
 * perform some action.
 */
export abstract class DynamoStreamLambdaHandler<CInj, RInj> {
  protected abstract inputSchema(): Joi.ObjectSchema | null

  constructor(
    protected readonly handlerName: string,
    private readonly injectorPromise: Promise<DynamoStreamInjector<CInj, RInj>>
  ) {}

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
    return metricScope((metrics: MetricsLogger) => {
      const handle = async (streamInput: DynamoDBStreamEvent): Promise<BatchFailureResponse> => {
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
          requestInjected = await injector.getRequestInjected(containerInjected, streamInput, log, metrics)
        } catch (err) {
          log.error({ err, streamInput }, 'Unexpected error building request injected.')
          throw new InjectionError(`Unexpected error building request injected:\n${err}`)
        }

        return await this.handleRequest({ containerInjected, requestInjected })
      }
      return async (streamInput: DynamoDBStreamEvent): Promise<BatchFailureResponse> => {
        const response = await handle(streamInput)

        return response
      }
    })
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
