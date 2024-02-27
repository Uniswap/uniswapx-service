import { OrderType } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import Joi from 'joi'
import { BaseOrdersRepository } from '../../repositories/base'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { kickoffOrderTrackingSfn } from '../shared/sfn'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'
import { LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON } from './util'

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
      this._checkLimitOrderStatusService = new CheckOrderStatusService(
        dbInterface,
        LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON,
        () => {
          return 30
        }
      )
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
    //make sure to change "Variable": "$.retryCount", in order-tracking-sfn.json to be 1+retryCount
    if (input.requestInjected?.retryCount > 300) {
      const stateMachineArn = input.requestInjected.stateMachineArn
      await kickoffOrderTrackingSfn(
        {
          orderHash: input.requestInjected.orderHash,
          chainId: input.requestInjected.chainId,
          orderStatus: input.requestInjected.orderStatus,
          quoteId: input.requestInjected.quoteId,
          orderType: input.requestInjected.orderType,
          stateMachineArn: input.requestInjected.stateMachineArn,
        },
        stateMachineArn
      )
    }
    if (input.requestInjected.orderType === OrderType.Limit) {
      return {
        ...(await this.getCheckLimitOrderStatusService().handleRequest(input.requestInjected)),
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    } else {
      return {
        ...(await this.getCheckOrderStatusService(input.containerInjected.dbInterface).handleRequest(
          input.requestInjected
        )),
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
