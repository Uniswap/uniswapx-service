/* eslint-disable */
import { DutchOrder } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { FillEventProcessor } from '../../lib/handlers/check-order-status/fill-event-processor'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON, getSettledAmounts } from '../../lib/handlers/check-order-status/util'
import { log } from '../../lib/Logging'
import { MOCK_ENCODED_ORDER, MOCK_ORDER_ENTITY, MOCK_ORDER_HASH } from './test-data'

jest.mock('../../lib/handlers/check-order-status/util')

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
  const getSettledAmountsMock = getSettledAmounts as any

  let providerMock: {
    getBlockNumber: jest.Mock<any, any>
    getTransaction: jest.Mock<any, any>
    getBlock: () => Promise<{ timestamp: number }>
  }

  beforeEach(() => {
    log.setLogLevel('SILENT')

    providerMock = {
      getBlockNumber: jest.fn(),
      getTransaction: jest.fn().mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      }),
      getBlock: () =>
        Promise.resolve({
          timestamp: 123456,
        }),
    }
  })

  it('should return the settled amount', async () => {
    const parsedOrder = DutchOrder.parse(MOCK_ENCODED_ORDER, 1)
    const quoteId = '1'
    const order = MOCK_ORDER_ENTITY
    const chainId = 1
    const startingBlockNumber = 0

    const getSettledAmountsReturn = {
      tokenOut: 'out',
      amountOut: '1',
      tokenIn: 'in',
      amountIn: '2',
    }

    getSettledAmountsMock.mockReturnValue([getSettledAmountsReturn])

    let fillEventProcessor = new FillEventProcessor(FILL_EVENT_LOOKBACK_BLOCKS_ON)

    const response = await fillEventProcessor.processFillEvent({
      provider: providerMock as any,
      fillEvent: MOCK_FILL_EVENT,
      parsedOrder,
      quoteId,
      order,
      chainId,
      startingBlockNumber,
    })
    expect(response).toEqual([getSettledAmountsReturn])
  })

  it('should return the settled amount', async () => {
    const parsedOrder = DutchOrder.parse(MOCK_ENCODED_ORDER, 1)
    const quoteId = '1'
    const order = MOCK_ORDER_ENTITY
    const chainId = 1
    const startingBlockNumber = 0

    const getSettledAmountsReturn = {
      tokenOut: 'out',
      amountOut: '1',
      tokenIn: 'in',
      amountIn: '2',
    }

    getSettledAmountsMock.mockReturnValue([getSettledAmountsReturn])

    let fillEventProcessor = new FillEventProcessor(FILL_EVENT_LOOKBACK_BLOCKS_ON)

    const response = await fillEventProcessor.processFillEvent({
      provider: providerMock as any,
      fillEvent: MOCK_FILL_EVENT,
      parsedOrder,
      quoteId,
      order,
      chainId,
      startingBlockNumber,
    })
    expect(response).toEqual([getSettledAmountsReturn])
  })
})
