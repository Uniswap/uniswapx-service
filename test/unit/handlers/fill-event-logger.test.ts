/* eslint-disable */
import { BigNumber } from 'ethers'
import { mock } from 'jest-mock-extended'
import { FillEventLogger } from '../../../lib/handlers/check-order-status/fill-event-logger'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../../../lib/handlers/check-order-status/util'
import { log } from '../../../lib/Logging'
import bunyan from 'bunyan'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { MOCK_ORDER_ENTITY, MOCK_ORDER_HASH } from '../../test-data'

jest.mock('../../../lib/handlers/check-order-status/util')

const MOCK_FILL_EVENT = {
  orderHash: MOCK_ORDER_HASH,
  filler: '0x123',
  nonce: BigNumber.from(1),
  swapper: '0x123',
  blockNumber: 12321312313,
  txHash: '0x1244345323',
  inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
  outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
} as any

describe('processFillEvent', () => {
  beforeEach(() => {
    log.level(bunyan.FATAL + 1) // Silence logs
  })

  it('should return the settled amounts even if output token is not found in settled amounts', async () => {
    const quoteId = '1'
    const order = MOCK_ORDER_ENTITY
    const chainId = 1
    const startingBlockNumber = 0

    const settledAmounts = {
      tokenOut: 'out',
      amountOut: '1',
      tokenIn: 'in',
      amountIn: '2',
    }

    const fillEventProcessor = new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, mock<AnalyticsService>())

    const response = await fillEventProcessor.processFillEvent({
      fillEvent: MOCK_FILL_EVENT,
      quoteId,
      order,
      chainId,
      startingBlockNumber,
      settledAmounts: [settledAmounts],
      tx: {
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      } as any,
      block: {
        baseFeePerGas: 1,
      } as any,
      timestamp: 1,
    })
    expect(response).toEqual([settledAmounts])
  })

  it('should return the settled amount in output token', async () => {
    const quoteId = '1'
    const order = MOCK_ORDER_ENTITY
    const chainId = 1
    const startingBlockNumber = 0

    const settledAmounts = {
      tokenOut: '0xoutput',
      amountOut: '1',
      tokenIn: 'in',
      amountIn: '2',
    }
    // this output should be ignored
    const settledAmounts2 = {
      tokenOut: '0xoutput2',
      amountOut: '1',
      tokenIn: 'in',
      amountIn: '2',
    }

    const analyticsService = mock<AnalyticsService>()
    const fillEventProcessor = new FillEventLogger(FILL_EVENT_LOOKBACK_BLOCKS_ON, analyticsService)

    await fillEventProcessor.processFillEvent({
      fillEvent: MOCK_FILL_EVENT,
      quoteId,
      order,
      chainId,
      startingBlockNumber,
      settledAmounts: [settledAmounts, settledAmounts2],
      tx: {
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      } as any,
      block: {
        baseFeePerGas: 1,
      } as any,
      timestamp: 1,
    })
    
    expect(analyticsService.logFillInfo).toHaveBeenCalledWith(
      MOCK_FILL_EVENT,
      order,
      quoteId,
      1,
      '0.0000000000000001',
      '1',
      '100',
      '0',
      settledAmounts  // Expect settleAmounts since it matches the output token
    )
  })
})
