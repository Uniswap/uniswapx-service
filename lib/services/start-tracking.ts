import { ExecutionAlreadyExists } from '@aws-sdk/client-sfn'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../entities'
import { kickoffOrderTrackingSfn, StartExecutionClient } from '../handlers/shared/sfn'

export type TrackedOrder = {
  orderHash: string
  chainId: number
  quoteId?: string
  orderType: OrderType
}

// 'already-started': a tracker named after this order exists, running or finished, because the
// order was posted before and its tracker started then.
export type StartTrackingResult = 'started' | 'already-started'

/** Starts tracking a newly stored order until it reaches a final status. */
export interface StartTracking {
  start(order: TrackedOrder): Promise<StartTrackingResult>
}

/**
 * Starts the order's first run on its chain's tracking state machine. The execution is named
 * after the order hash and run 0, so a re-posted order can't start a second tracker.
 */
export class SfnStartTracking implements StartTracking {
  constructor(
    private readonly client: StartExecutionClient,
    private readonly stateMachineArn: (chainId: number) => string
  ) {}

  async start({ orderHash, chainId, quoteId, orderType }: TrackedOrder): Promise<StartTrackingResult> {
    const stateMachineArn = this.stateMachineArn(chainId)
    try {
      await kickoffOrderTrackingSfn(
        {
          orderHash,
          chainId,
          orderStatus: ORDER_STATUS.OPEN,
          quoteId: quoteId ?? '',
          orderType,
          stateMachineArn,
          runIndex: 0,
        },
        stateMachineArn,
        this.client
      )
    } catch (err) {
      if (err instanceof ExecutionAlreadyExists) {
        return 'already-started'
      }
      throw err
    }
    return 'started'
  }
}
