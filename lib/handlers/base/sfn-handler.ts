import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { InjectionError, SfnInputValidationError } from '../../util/errors'
import { BaseInjector, BaseLambdaHandler, BaseRInj } from './base'

export type SfnStateInputOutput = Record<string, string | number | { [key: string]: string }[]>

export type SfnHandler = (event: SfnStateInputOutput) => Promise<SfnStateInputOutput>

export abstract class SfnInjector<CInj, RInj extends BaseRInj> extends BaseInjector<CInj> {
  public constructor(protected injectorName: string) {
    super(injectorName)
  }

  public abstract getRequestInjected(event: SfnStateInputOutput, log: Logger, metrics: MetricsLogger): Promise<RInj>
}

export abstract class SfnLambdaHandler<CInj, RInj extends BaseRInj> extends BaseLambdaHandler<
  SfnHandler,
  { containerInjected: CInj; requestInjected: RInj },
  SfnStateInputOutput
> {
  protected abstract inputSchema(): Joi.ObjectSchema | null

  constructor(handlerName: string, private readonly injectorPromise: Promise<SfnInjector<CInj, RInj>>) {
    super(handlerName)
  }

  get handler(): SfnHandler {
    return async (event: SfnStateInputOutput): Promise<SfnStateInputOutput> => {
      const handler = this.buildHandler()
      return await handler(event)
    }
  }

  protected buildHandler(): SfnHandler {
    return metricScope((metrics: MetricsLogger) => {
      const handle = async (sfnInput: SfnStateInputOutput): Promise<SfnStateInputOutput> => {
        const log: Logger = bunyan.createLogger({
          name: this.handlerName,
          serializers: bunyan.stdSerializers,
          level: process.env.NODE_ENV == 'test' ? bunyan.FATAL + 1 : bunyan.INFO,
        })

        await this.validateInput(sfnInput, log)

        const injector = await this.injectorPromise

        const containerInjected = injector.getContainerInjected()

        let requestInjected: RInj
        try {
          requestInjected = await injector.getRequestInjected(sfnInput, log, metrics)
        } catch (err) {
          log.error({ err, sfnInput }, 'Unexpected error building request injected.')
          throw new InjectionError(`Unexpected error building request injected:\n${err}`)
        }

        return await this.handleRequest({ containerInjected, requestInjected })
      }

      return async (sfnInput: SfnStateInputOutput): Promise<SfnStateInputOutput> => {
        const response = await handle(sfnInput)

        return response
      }
    })
  }

  private async validateInput(input: SfnStateInputOutput, log: Logger): Promise<SfnStateInputOutput> {
    const schema = this.inputSchema()

    if (schema) {
      const inputValidation = schema.validate(input, {
        allowUnknown: true,
        stripUnknown: true,
      })
      if (inputValidation.error) {
        log.info({ inputValidation }, 'Input failed validation')
        throw new SfnInputValidationError(inputValidation.error.message)
      }
    }
    return input
  }

  public abstract handleRequest(input: { containerInjected: CInj; requestInjected: RInj }): Promise<SfnStateInputOutput>
}
