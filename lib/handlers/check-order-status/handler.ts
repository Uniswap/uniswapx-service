import { MetricUnits } from '@aws-lambda-powertools/metrics'
import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { CheckOrderStatusHandlerMetricNames, powertoolsMetric } from '../../Metrics'
import { RelayOrderService } from '../../services/RelayOrderService'
import { SfnInjector, SfnLambdaHandler, SfnStateInputOutput } from '../base'
import { kickoffOrderTrackingSfn } from '../shared/sfn'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'
import { CheckOrderStatusService } from './service'
import { log } from '../../Logging'

// How long past an order's deadline we keep restarting its tracking step
// function. A short grace lets a late fill be observed; beyond it an
// unresolved order is the GS reaper's job. Without this bound, an order that
// never reaches a terminal status (e.g. its fill lookup keeps failing)
// respawns executions forever.
export const ORDER_TRACKING_ABANDON_GRACE_SECONDS = 2 * 60 * 60

// Hard cap on execution respawns for state that carries no deadline (today:
// Relay orders). The deadline grace above cannot fire without a deadline, so
// this cap is the only bound between a never-terminal order (e.g. one whose
// validation keeps returning UnknownError) and an infinite chain of restarted
// executions. Each run is ~300 polls, so this still gives short-lived orders
// hours of tracking before we abandon.
export const MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE = 5

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
    const retryCount = input.requestInjected?.retryCount ?? 0
    if (retryCount > 300) {
      // Only the Dutch and Limit services echo `deadline` into the SFN state,
      // so the deadline gate can only fire for order types the GS reaper can
      // later resolve. State without a deadline (Relay orders) is bounded by
      // the run-count cap instead.
      const deadline = input.requestInjected.deadline
      const nowSec = Math.floor(Date.now() / 1000)
      const currentRunIndex = input.requestInjected.runIndex || 0
      const pastDeadlineGrace = Boolean(deadline) && nowSec > (deadline as number) + ORDER_TRACKING_ABANDON_GRACE_SECONDS
      const exhaustedRunsWithoutDeadline = !deadline && currentRunIndex >= MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE
      if (pastDeadlineGrace || exhaustedRunsWithoutDeadline) {
        log.warn('Not restarting step function: abandoning order tracking', {
          orderHash: input.requestInjected.orderHash,
          retryCount,
          deadline,
          runIndex: currentRunIndex,
          reason: pastDeadlineGrace ? 'past deadline grace period; leaving resolution to the reaper' : 'run cap reached for deadline-less order',
        })
        powertoolsMetric
          .singleMetric()
          .addMetric(CheckOrderStatusHandlerMetricNames.OrderTrackingAbandonedCount, MetricUnits.Count, 1)
        if (exhaustedRunsWithoutDeadline) {
          powertoolsMetric
            .singleMetric()
            .addMetric(CheckOrderStatusHandlerMetricNames.OrderTrackingAbandonedNoBackstopCount, MetricUnits.Count, 1)
        }
      } else {
        const stateMachineArn = input.requestInjected.stateMachineArn
        const nextRunIndex = currentRunIndex + 1

        log.info('Restarting step function due to retry limit', {
          orderHash: input.requestInjected.orderHash,
          retryCount,
          currentRunIndex,
          nextRunIndex
        })

        await kickoffOrderTrackingSfn(
          {
            orderHash: input.requestInjected.orderHash,
            chainId: input.requestInjected.chainId,
            orderStatus: input.requestInjected.orderStatus,
            quoteId: input.requestInjected.quoteId,
            orderType: input.requestInjected.orderType,
            stateMachineArn: input.requestInjected.stateMachineArn,
            runIndex: nextRunIndex,
            // Limit orders can live up to a year: carrying their original
            // window across that lifetime would make the end-of-life fill
            // lookup one enormous getLogs that RPCs reject. A fresh window is
            // safe for them -- block-cadence polling observes a consumed nonce
            // within blocks of the fill.
            startingBlockNumber:
              input.requestInjected.orderType === OrderType.Limit
                ? undefined
                : input.requestInjected.startingBlockNumber,
            getFillLogAttempts: input.requestInjected.getFillLogAttempts,
            deadline,
          },
          stateMachineArn
        )
        powertoolsMetric
          .singleMetric()
          .addMetric(CheckOrderStatusHandlerMetricNames.StepFunctionKickedOffCount, MetricUnits.Count, 1)
      }
    }

    if (input.requestInjected.orderType === OrderType.Limit) {
      const response = await this.checkLimitOrderStatusService.handleRequest(input.requestInjected)
      return {
        ...response,
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
        runIndex: input.requestInjected.runIndex,
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
        runIndex: input.requestInjected.runIndex,
      }
    } else {
      // Dutch, Dutch_V2, Dutch_V3, Priority
      const response = await this.checkOrderStatusService.handleRequest(input.requestInjected)
      return {
        ...response,
        orderType: input.requestInjected.orderType,
        stateMachineArn: input.requestInjected.stateMachineArn,
        runIndex: input.requestInjected.runIndex,
      }
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }
}
