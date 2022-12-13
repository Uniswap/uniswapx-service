import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { DynamoStreamInputValidationError, InjectionError } from '../../util/errors'
import { BaseInjector, BaseLambdaHandler, BaseRInj } from './base'

export type DynamoStreamInputOutput = Record<string, string | number | Array<any>>

export type DynamoStreamHandler = (event: DynamoStreamInputOutput) => Promise<DynamoStreamInputOutput>

export abstract class DynamoStreamInjector<CInj, RInj extends BaseRInj> extends BaseInjector<CInj> {
  public constructor(protected injectorName: string) {
    super(injectorName)
  }

  public abstract getRequestInjected(
    containerInjected: CInj,
    event: DynamoStreamInputOutput,
    log: Logger
  ): Promise<RInj>
}

export abstract class DynamoStreamLambdaHandler<CInj, RInj extends BaseRInj> extends BaseLambdaHandler<
  DynamoStreamHandler,
  { containerInjected: CInj; requestInjected: RInj },
  DynamoStreamInputOutput
> {
  protected abstract inputSchema(): Joi.ObjectSchema | null

  constructor(handlerName: string, private readonly injectorPromise: Promise<DynamoStreamInjector<CInj, RInj>>) {
    super(handlerName)
  }

  get handler(): DynamoStreamHandler {
    return async (event: DynamoStreamInputOutput): Promise<DynamoStreamInputOutput> => {
      console.log('base event handler: ', event)
      const handler = this.buildHandler()
      return await handler(event)
    }
  }

  protected buildHandler(): DynamoStreamHandler {
    return async (streamInput: DynamoStreamInputOutput): Promise<DynamoStreamInputOutput> => {
      console.log('streamInput: ', streamInput)

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

  private async validateInput(input: DynamoStreamInputOutput, log: Logger): Promise<DynamoStreamInputOutput> {
    const schema = this.inputSchema()

    if (schema) {
      const inputValidation = schema.validate(input, {
        allowUnknown: true,
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
  }): Promise<DynamoStreamInputOutput>
}
