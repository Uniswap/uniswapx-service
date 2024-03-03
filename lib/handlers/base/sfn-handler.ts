import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { checkDefined } from '../../preconditions/preconditions'
import { InjectionError, SfnInputValidationError } from '../../util/errors'

export type SfnStateInputOutput = Record<string, string | number | { [key: string]: string }[]>

export type SfnHandler = (event: SfnStateInputOutput) => Promise<SfnStateInputOutput>

export abstract class SfnInjector<CInj, RInj> {
  protected containerInjected: CInj | undefined

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

  public abstract getRequestInjected(event: SfnStateInputOutput, log: Logger, metrics: MetricsLogger): Promise<RInj>
}

export abstract class SfnLambdaHandler<CInj, RInj> {
  protected abstract inputSchema(): Joi.ObjectSchema | null

  constructor(
    protected readonly handlerName: string,
    private readonly injectorPromise: Promise<SfnInjector<CInj, RInj>>
  ) {}

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
