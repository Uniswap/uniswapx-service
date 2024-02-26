import { OrderType } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import Joi from 'joi'
import { BaseOrdersRepository } from '../../repositories/base'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  private _checkOrderStatusService!: CheckOrderStatusService
  private _checkLimitOrderStatusService!: CheckOrderStatusService

  private getCheckOrderStatusService(dbInterface: BaseOrdersRepository) {
    if (!this._checkOrderStatusService) {
      this._checkOrderStatusService = new CheckOrderStatusService(dbInterface)
    }
    return this._checkOrderStatusService
  }

  private getCheckLimitOrderStatusService() {
    if (!this._checkLimitOrderStatusService) {
      const dbInterface = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
      this._checkLimitOrderStatusService = new CheckOrderStatusService(dbInterface)
    }
    return this._checkLimitOrderStatusService
  }

  constructor(handlerName: string, injectorPromise: Promise<SfnInjector<ContainerInjected, RequestInjected>>) {
    super(handlerName, injectorPromise)
  }

  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<SfnStateInputOutput> {
    if (input.requestInjected.orderType === OrderType.Dutch) {
      return {
        ...(await this.getCheckOrderStatusService(input.containerInjected.dbInterface).handleRequest(
          input.requestInjected
        )),
        orderType: input.requestInjected.orderType,
      }
    } else {
      return {
        ...(await this.getCheckLimitOrderStatusService().handleRequest(input.requestInjected)),
        orderType: input.requestInjected.orderType,
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
