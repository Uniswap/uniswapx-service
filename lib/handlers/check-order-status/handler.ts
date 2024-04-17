import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { CheckOrderStatusHandlerMetricNames, powertoolsMetric } from '../../Metrics'
import { RelayOrderService } from '../../services/RelayOrderService/RelayOrderService'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { kickoffOrderTrackingSfn } from '../shared/sfn'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  constructor(
    handlerName: string,
    injectorPromise: Promise<SfnInjector<ContainerInjected, RequestInjected>>,
    private readonly checkOrderStatusService: CheckOrderStatusService,
    private readonly checkLimitOrderStatusService: CheckOrderStatusService,
    private readonly relayOrderService: RelayOrderService
  ) {
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
      powertoolsMetric
        .singleMetric()
        .addMetric(CheckOrderStatusHandlerMetricNames.StepFunctionKickedOffCount, MetricUnits.Count, 1)
    }

    if (input.requestInjected.orderType === OrderType.Limit) {
      const response = await this.checkLimitOrderStatusService.handleRequest(input.requestInjected)
      return {
        ...response,
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    } else if (input.requestInjected.orderType === OrderType.Relay) {
      const response = await this.relayOrderService.checkOrderStatus(
        input.requestInjected.orderHash,
        input.requestInjected.quoteId,
        input.requestInjected.startingBlockNumber,
        input.requestInjected.orderStatus,
        input.requestInjected.getFillLogAttempts,
        input.requestInjected.retryCount,
        input.requestInjected.provider
      )
      return {
        ...response,
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    } else {
      // Dutch, Dutch_V2
      const response = await this.checkOrderStatusService.handleRequest(input.requestInjected)
      return {
        ...response,
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
