import Joi from 'joi'
import { BaseOrdersRepository } from '../../repositories/base'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  private _checkOrderStatusService!: CheckOrderStatusService

  private getCheckOrderStatusService(dbInterface: BaseOrdersRepository) {
    if (!this._checkOrderStatusService) {
      this._checkOrderStatusService = new CheckOrderStatusService(dbInterface)
    }
    return this._checkOrderStatusService
  }

  constructor(handlerName: string, injectorPromise: Promise<SfnInjector<ContainerInjected, RequestInjected>>) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<SfnStateInputOutput> {
    return this.getCheckOrderStatusService(input.containerInjected.dbInterface).handleRequest(input.requestInjected)
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
