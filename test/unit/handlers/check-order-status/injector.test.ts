import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { MetricsLogger } from 'aws-embedded-metrics'
import Logger from 'bunyan'
import { CheckOrderStatusInjector } from '../../../../lib/handlers/check-order-status/injector'
import { ORDER_STATUS } from '../../../../lib/entities'

describe('CheckOrderStatusInjector', () => {
  const injector = new CheckOrderStatusInjector('checkOrderStatus')
  const metricsMock = mock<MetricsLogger>()
  const logMock = mock<Logger>()
  logMock.child.mockReturnValue(logMock)

  beforeAll(() => {
    process.env.RPC_PREFIX_URL = 'http://localhost:8545'
  })

  it('parses the SFN-state fields carried for step function restarts', async () => {
    // Pins the event -> requestInjected leg of the restart wiring: if any of
    // these fields stopped being read, the deadline-based restart gate and the
    // carried fill-search coverage would silently become no-ops.
    const requestInjected = await injector.getRequestInjected(
      {
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
        deadline: 1700000000,
      },
      logMock,
      metricsMock
    )

    expect(requestInjected).toMatchObject({
      chainId: 1,
      orderHash: '0xhash',
      startingBlockNumber: 1234,
      getFillLogAttempts: 1,
      retryCount: 301,
      runIndex: 2,
      deadline: 1700000000,
    })
  })

  it('defaults the optional fields when absent (initial kickoff and pre-deploy executions)', async () => {
    const requestInjected = await injector.getRequestInjected(
      {
        chainId: 1,
        orderHash: '0xhash',
        quoteId: 'quoteId',
        orderType: OrderType.Dutch,
        orderStatus: ORDER_STATUS.OPEN,
        stateMachineArn: 'arn:sfn',
      },
      logMock,
      metricsMock
    )

    expect(requestInjected).toMatchObject({
      startingBlockNumber: 0,
      getFillLogAttempts: 0,
      retryCount: 0,
      runIndex: 0,
    })
    expect(requestInjected.deadline).toBeUndefined()
  })
})
