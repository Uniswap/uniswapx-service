import { OrderType } from '@uniswap/uniswapx-sdk'
import orderTrackingStateMachine from '../../../../bin/definitions/order-tracking-sfn.json'
import { ORDER_STATUS } from '../../../../lib/entities'
import {
  CheckOrderStatusHandler,
  MAX_ORDER_TRACKING_RUNS_WITHOUT_DEADLINE,
  ORDER_TRACKING_ABANDON_GRACE_SECONDS,
} from '../../../../lib/handlers/check-order-status/handler'
import { kickoffOrderTrackingSfn } from '../../../../lib/handlers/shared/sfn'
import { allLegacy, FixedChainOwners } from '../../../fakes/chain-owners'

jest.mock('../../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

describe('CheckOrderStatusHandler step function restarts', () => {
  const checkOrderStatusServiceMock = { handleRequest: jest.fn() }
  const checkLimitOrderStatusServiceMock = { handleRequest: jest.fn() }

  const handler = new CheckOrderStatusHandler(
    'checkOrderStatus',
    Promise.resolve({}) as any,
    checkOrderStatusServiceMock as any,
    checkLimitOrderStatusServiceMock as any,
    allLegacy()
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

  it('stops restarting deadline-less state at the run cap (no infinite respawn for UnknownError zombies)', async () => {
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

describe('CheckOrderStatusHandler and the chain owner file', () => {
  const dutchService = { handleRequest: jest.fn() }
  const limitService = { handleRequest: jest.fn() }
  const handlerFor = (chainOwners: FixedChainOwners) =>
    new CheckOrderStatusHandler(
      'checkOrderStatus',
      Promise.resolve({}) as any,
      dutchService as any,
      limitService as any,
      chainOwners
    )

  // At the retry limit, so a legacy-tracked chain would also restart the run.
  const requestInjected = {
    chainId: 8453,
    orderHash: '0xhash',
    quoteId: 'quoteId',
    orderType: OrderType.Dutch_V2,
    orderStatus: ORDER_STATUS.OPEN,
    startingBlockNumber: 1234,
    getFillLogAttempts: 0,
    retryCount: 301,
    runIndex: 2,
    stateMachineArn: 'arn:sfn',
    deadline: Math.floor(Date.now() / 1000) + 3600,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    dutchService.handleRequest.mockResolvedValue({ orderStatus: ORDER_STATUS.OPEN, retryCount: 302 })
    limitService.handleRequest.mockResolvedValue({ orderStatus: ORDER_STATUS.OPEN, retryCount: 302 })
  })

  it('tracks as before when every chain is on legacy, reading the owner file on each poll', async () => {
    const owners = allLegacy()

    const output = await handlerFor(owners).handleRequest({
      containerInjected: {} as any,
      requestInjected: requestInjected as any,
    })

    expect(owners.reads).toEqual([8453])
    expect(kickoffOrderTrackingSfn).toHaveBeenCalledTimes(1)
    expect(dutchService.handleRequest).toHaveBeenCalledTimes(1)
    expect(output).toEqual({
      orderStatus: ORDER_STATUS.OPEN,
      retryCount: 302,
      orderType: OrderType.Dutch_V2,
      stateMachineArn: 'arn:sfn',
      runIndex: 2,
    })
    expect(output.trackingHandedOff).toBeUndefined()
  })

  it('tracks a chain uniswapx posts on as long as legacy still tracks it', async () => {
    await handlerFor(new FixedChainOwners({ 8453: { posting: 'uniswapx', tracking: 'legacy' } })).handleRequest({
      containerInjected: {} as any,
      requestInjected: requestInjected as any,
    })

    expect(dutchService.handleRequest).toHaveBeenCalledTimes(1)
  })

  it.each(['draining', 'phase1'] as const)(
    'ends the run on a %s chain with no restart, poll or write, for Dutch and Limit orders alike',
    async (tracking) => {
      for (const orderType of [OrderType.Dutch_V2, OrderType.Limit]) {
        const output = await handlerFor(new FixedChainOwners({ 8453: { tracking } })).handleRequest({
          containerInjected: {} as any,
          requestInjected: { ...requestInjected, orderType } as any,
        })

        expect(output).toEqual({
          orderHash: '0xhash',
          chainId: 8453,
          quoteId: 'quoteId',
          orderStatus: ORDER_STATUS.OPEN,
          orderType,
          stateMachineArn: 'arn:sfn',
          runIndex: 2,
          trackingHandedOff: true,
        })
      }
      // The services own the status write, the analytics records and the fill lookups.
      expect(dutchService.handleRequest).not.toHaveBeenCalled()
      expect(limitService.handleRequest).not.toHaveBeenCalled()
      expect(kickoffOrderTrackingSfn).not.toHaveBeenCalled()
    }
  )

  it('only hands off the chains the file names', async () => {
    await handlerFor(new FixedChainOwners({ 1: { tracking: 'phase1' } })).handleRequest({
      containerInjected: {} as any,
      requestInjected: requestInjected as any,
    })

    expect(dutchService.handleRequest).toHaveBeenCalledTimes(1)
  })

  it('routes a handed-off run to a succeed state ahead of every other rule', () => {
    const choice = orderTrackingStateMachine.States.latestOrderStatus
    const [first] = choice.Choices as any[]
    // IsPresent first: comparing a missing field fails the execution.
    expect(first).toEqual({
      And: [
        { Variable: '$.trackingHandedOff', IsPresent: true },
        { Variable: '$.trackingHandedOff', BooleanEquals: true },
      ],
      Next: 'trackingHandedOff',
    })
    expect((orderTrackingStateMachine.States as any).trackingHandedOff).toEqual({ Type: 'Succeed' })
  })
})
