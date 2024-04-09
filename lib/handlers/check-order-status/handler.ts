import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import Joi from 'joi'
import { CheckOrderStatusHandlerMetricNames, powertoolsMetric } from '../../Metrics'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { RelayOrderRepository } from '../../repositories/RelayOrderRepository'
import { AnalyticsService } from '../../services/analytics-service'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { kickoffOrderTrackingSfn } from '../shared/sfn'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from './util'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  private readonly checkOrderStatusService: CheckOrderStatusService
  private readonly checkLimitOrderStatusService: CheckOrderStatusService
  private readonly checkRelayOrderStatusService: CheckOrderStatusService

  constructor(handlerName: string, injectorPromise: Promise<SfnInjector<ContainerInjected, RequestInjected>>) {
    super(handlerName, injectorPromise)
    this.checkOrderStatusService = new CheckOrderStatusService(
      DutchOrdersRepository.create(new DynamoDB.DocumentClient()),
      OrderType.Dutch,
      AnalyticsService.create()
    )

    this.checkLimitOrderStatusService = new CheckOrderStatusService(
      LimitOrdersRepository.create(new DynamoDB.DocumentClient()),
      OrderType.Limit,
      AnalyticsService.create(),
      FILL_EVENT_LOOKBACK_BLOCKS_ON,
      () => {
        return 30
      }
    )

    this.checkRelayOrderStatusService = new CheckOrderStatusService(
      RelayOrderRepository.create(new DynamoDB.DocumentClient()),
      OrderType.Relay,
      AnalyticsService.create()
    )
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
      return {
        ...(await this.checkLimitOrderStatusService.handleRequest(input.requestInjected)),
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    } else if (input.requestInjected.orderType === OrderType.Relay) {
      return {
        ...(await this.checkRelayOrderStatusService.handleRequest(input.requestInjected)),
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    } else {
      // Dutch, Dutch_V2
      return {
        ...(await this.checkOrderStatusService.handleRequest(input.requestInjected)),
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
