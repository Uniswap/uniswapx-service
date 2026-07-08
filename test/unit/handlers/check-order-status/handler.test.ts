import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../../lib/entities'
import {
  CheckOrderStatusHandler,
  MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE,
  ORDER_TRACKING_ABANDON_GRACE_SECONDS,
} from '../../../../lib/handlers/check-order-status/handler'
import { kickoffOrderTrackingSfn } from '../../../../lib/handlers/shared/sfn'

jest.mock('../../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

describe('CheckOrderStatusHandler step function restarts', () => {
  const checkOrderStatusServiceMock = { handleRequest: jest.fn() }
  const checkLimitOrderStatusServiceMock = { handleRequest: jest.fn() }
  const relayOrderServiceMock = { checkOrderStatus: jest.fn() }

  const handler = new CheckOrderStatusHandler(
    'checkOrderStatus',
    Promise.resolve({}) as any,
    checkOrderStatusServiceMock as any,
    checkLimitOrderStatusServiceMock as any,
    relayOrderServiceMock as any
  )

  const nowSec = Math.floor(Date.now() / 1000)
  const baseRequestInjected = {
    chainId: 1,
    orderHash: '0xhash',
    quoteId: 'quoteId',
    orderType: OrderType.Dutch,
    orderStatus: ORDER_STATUS.OPEN,
    startingBlockNumber: 1234,
    getFillLogAttempts: 1,
    retryCount: 301,
    runIndex: 2,
    stateMachineArn: 'arn:sfn',
    deadline: nowSec + 3600,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    checkOrderStatusServiceMock.handleRequest.mockResolvedValue({ orderStatus: ORDER_STATUS.OPEN })
  })

  it('restarts at the retry limit and carries fill-search coverage and grace-poll progress forward', async () => {
    await handler.handleRequest({ containerInjected: {} as any, requestInjected: baseRequestInjected as any })

    expect(kickoffOrderTrackingSfn).toHaveBeenCalledWith(
      expect.objectContaining({
        orderHash: '0xhash',
        runIndex: 3,
        startingBlockNumber: 1234,
        getFillLogAttempts: 1,
        deadline: baseRequestInjected.deadline,
      }),
      'arn:sfn'
    )
  })

  it('does NOT restart when the order is past its deadline grace period', async () => {
    const requestInjected = {
      ...baseRequestInjected,
      deadline: nowSec - ORDER_TRACKING_ABANDON_GRACE_SECONDS - 60,
    }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    expect(kickoffOrderTrackingSfn).not.toHaveBeenCalled()
  })

  it('still restarts when the deadline is unknown (executions started before this field existed)', async () => {
    const requestInjected = { ...baseRequestInjected, deadline: undefined }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    expect(kickoffOrderTrackingSfn).toHaveBeenCalled()
  })

  it('stops restarting deadline-less state at the run cap (no infinite respawn for Relay/UnknownError zombies)', async () => {
    // Without a deadline the grace gate can never fire, so the run cap is the
    // only bound on the respawn loop.
    const requestInjected = {
      ...baseRequestInjected,
      deadline: undefined,
      runIndex: MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE,
    }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    expect(kickoffOrderTrackingSfn).not.toHaveBeenCalled()
  })

  it('keeps restarting deadline-carrying state beyond the deadline-less run cap while inside the grace period', async () => {
    // The run cap applies only when there is no deadline to bound tracking;
    // long-lived orders (e.g. Limit) legitimately respawn many times.
    const requestInjected = {
      ...baseRequestInjected,
      runIndex: MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE + 10,
    }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    expect(kickoffOrderTrackingSfn).toHaveBeenCalled()
  })

  it('does not restart below the retry limit', async () => {
    const requestInjected = { ...baseRequestInjected, retryCount: 300 }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    expect(kickoffOrderTrackingSfn).not.toHaveBeenCalled()
  })

  it('does not carry startingBlockNumber for Limit orders (their lifetime-wide window is not queryable)', async () => {
    checkLimitOrderStatusServiceMock.handleRequest.mockResolvedValue({ orderStatus: ORDER_STATUS.OPEN })
    const requestInjected = { ...baseRequestInjected, orderType: OrderType.Limit }

    await handler.handleRequest({ containerInjected: {} as any, requestInjected: requestInjected as any })

    const kickoffInput = (kickoffOrderTrackingSfn as jest.Mock).mock.calls[0][0]
    expect(kickoffInput.startingBlockNumber).toBeUndefined()
    expect(kickoffInput.getFillLogAttempts).toBe(1)
  })

})
