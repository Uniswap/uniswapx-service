import { default as Logger } from 'bunyan'
import { checkDefined } from '../../preconditions/preconditions'

export type BaseRInj = {
  log: Logger
}

export type BaseHandleRequestParams<CInj, Event = Record<string, string | number>> = {
  event: Event
  containerInjected: CInj
}

export abstract class BaseInjector<CInj> {
  protected containerInjected: CInj | undefined

  public constructor(protected injectorName: string) {
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
}

export abstract class BaseLambdaHandler<HandlerType, InputType, OutputType> {
  constructor(protected readonly handlerName: string) {}

  public abstract get handler(): HandlerType

  protected abstract buildHandler(): HandlerType

  protected abstract handleRequest(params: InputType): Promise<OutputType>
}
