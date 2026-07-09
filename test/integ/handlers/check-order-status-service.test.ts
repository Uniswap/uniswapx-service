import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { FillEventLogger } from '../../../lib/handlers/check-order-status/fill-event-logger'
import {
  CheckOrderStatusRequest,
  CheckOrderStatusService,
  CheckOrderStatusUtils,
} from '../../../lib/handlers/check-order-status/service'
import {
  calculateDutchRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
} from '../../../lib/handlers/check-order-status/util'
import { log } from '../../../lib/Logging'
import { MOCK_ORDER_ENTITY, MOCK_ORDER_HASH, MOCK_V2_ORDER_ENTITY } from '../../test-data'

jest.mock('../../../lib/handlers/check-order-status/util', () => {
  const original = jest.requireActual('../../../lib/handlers/check-order-status/util')
  return {
    ...original,
    getWatcher: jest.fn(),
    getProvider: jest.fn(),
    getValidator: jest.fn(),
  }
})

describe('checkOrderStatusService', () => {
  const mockedBlockNumber = 0
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const getBlockNumberMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()
  let analyticsMock = {
    logCancelled: jest.fn(),
    logInsufficientFunds: jest.fn(),
  } as any
  describe('check order status', () => {
    let watcherMock: { getFillEvents: jest.Mock<any, any>; getFillInfo: jest.Mock<any, any> },
      providerMock: {
        getBlockNumber: jest.Mock<any, any>
        getTransaction: jest.Mock<any, any>
        getBlock: () => Promise<{ timestamp: number }>
      },
      validatorMock: { validate: jest.Mock<any, any> },
      ordersRepositoryMock: any,
      checkOrderStatusService: CheckOrderStatusService,
      openOrderRequest: CheckOrderStatusRequest

    beforeEach(() => {
      log.setLogLevel('SILENT')
      jest.clearAllMocks()
      ordersRepositoryMock = {
        updateOrderStatus: jest.fn(),
        getByHash: jest.fn(),
      } as any

      analyticsMock = {
        logCancelled: jest.fn(),
        logInsufficientFunds: jest.fn(),
      }

      checkOrderStatusService = new CheckOrderStatusService(
        ordersRepositoryMock,
        FILL_EVENT_LOOKBACK_BLOCKS_ON,
        mock<FillEventLogger>(),
        new CheckOrderStatusUtils(OrderType.Dutch, analyticsMock, ordersRepositoryMock, calculateDutchRetryWaitSeconds)
      )

      watcherMock = {
        getFillEvents: getFillEventsMock,
        getFillInfo: getFillInfoMock,
      }
      providerMock = {
        getBlockNumber: getBlockNumberMock,
        getTransaction: getTransactionMock,
        getBlock: () =>
          Promise.resolve({
            timestamp: 123456,
          }),
      }
      validatorMock = {
        validate: jest.fn(),
      }

      getTransactionMock.mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      })

      ordersRepositoryMock.getByHash.mockResolvedValue(MOCK_ORDER_ENTITY)
      ordersRepositoryMock.updateOrderStatus.mockResolvedValue()

      openOrderRequest = {
        orderHash: MOCK_ORDER_HASH,
        chainId: 1,
        orderStatus: ORDER_STATUS.OPEN,
        provider: providerMock as any,
        orderWatcher: watcherMock as any,
        orderQuoter: validatorMock as any,
        quoteId: '',
        getFillLogAttempts: 0,
        startingBlockNumber: 0,
        retryCount: 0,
        orderType: OrderType.Dutch,
      }
    })

    describe('Expired', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.Expired)
      })

      it('should close order with filled if expired and filled', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
            {
              orderHash: MOCK_ORDER_HASH,
              filler: '0x123',
              nonce: BigNumber.from(1),
              swapper: '0x123',
              blockNumber: 12321312313,
              txHash: '0x1244345323',
              inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
              outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
            },
          ]
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })

      it('should retry if expired and getFillLogAttempts = 0', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            getFillLogAttempts: 1,
          })
        )
      })

      it('should should update with expired if getFillLogAttempts = 1', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest({
          ...openOrderRequest,
          getFillLogAttempts: 1,
        })

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'expired',
          })
        )
      })
    })

    describe('OrderValidation.NonceUsed', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.NonceUsed)
      })

      it('should close order with filled if nonce used and filled', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
            {
              orderHash: MOCK_ORDER_HASH,
              filler: '0x123',
              nonce: BigNumber.from(1),
              swapper: '0x123',
              blockNumber: 12321312313,
              txHash: '0x1244345323',
              inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
              outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
            },
          ]
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })

      it('should retry if nonce used and no fillEvent and getFillLogAttempts = 0', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            getFillLogAttempts: 1,
          })
        )
      })

      it('should should update with cancelled if getFillLogAttempts = 1', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest({ ...openOrderRequest, getFillLogAttempts: 1 })

        expect(analyticsMock.logCancelled).toHaveBeenCalled()
        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'cancelled',
          })
        )
      })

      it('should NOT cancel when the fill lookup fails, even at getFillLogAttempts = 1', async () => {
        // Regression: a used nonce is consistent with a fill. If we can't read
        // fill events (e.g. RPC getLogs range/rate limit), we must not finalize
        // CANCELLED on incomplete info. The error propagates so the state
        // machine's Retry re-polls it and, if it persists, its Catch fails the
        // execution loudly instead of this poll quietly writing a status.
        getFillInfoMock.mockRejectedValue(new Error('limit exceeded'))

        await expect(
          checkOrderStatusService.handleRequest({ ...openOrderRequest, getFillLogAttempts: 1 })
        ).rejects.toThrow('limit exceeded')

        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(analyticsMock.logCancelled).not.toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
      })
    })

    describe('OrderValidation.InsufficientFunds', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InsufficientFunds)
      })

      it('should update status with insufficient-funds', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(analyticsMock.logInsufficientFunds).toHaveBeenCalled()
        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'insufficient-funds',
          })
        )
      })
    })

    describe('OrderValidation.InvalidSignature', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InvalidSignature)
      })

      it('should update status with error', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'error',
          })
        )
      })
    })

    describe('OrderValidation.InvalidOrderFields', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InvalidOrderFields)
      })

      it('should update status with error', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'error',
          })
        )
      })
    })

    describe('OrderValidation.UnknownError', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.UnknownError)
      })

      it('should keep order open (not terminal error) on an ambiguous/transient UnknownError', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        // open == lastStatus, so no terminal write happens
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'open',
          })
        )
      })
    })

    describe('fill-search window anchoring (getFillSearchFromBlock)', () => {
      // FILL_CHECK_OVERLAP_BLOCK in the service
      const OVERLAP = 20

      it('anchors Dutch_V3 to decayStartBlock so early fills stay in range', () => {
        const order: any = { type: OrderType.Dutch_V3, cosignerData: { decayStartBlock: 1000 } }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5000)
        // min(rolling - overlap, decayStartBlock - overlap) = min(4980, 980)
        expect(fromBlock).toBe(980)
      })

      it('never shrinks coverage below the rolling window', () => {
        const order: any = { type: OrderType.Dutch_V3, cosignerData: { decayStartBlock: 1000 } }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 500)
        // rolling - overlap (480) is already below the anchor, so it wins
        expect(fromBlock).toBe(480)
      })

      it('keeps the rolling window for timestamp-based types (Dutch)', () => {
        const order: any = { type: OrderType.Dutch }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5000)
        expect(fromBlock).toBe(5000 - OVERLAP)
      })

      it('anchors Priority to its auction target block', () => {
        const order: any = { type: OrderType.Priority, cosignerData: { auctionTargetBlock: 1000 } }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5000)
        expect(fromBlock).toBeLessThanOrEqual(1000 - OVERLAP)
      })

      it('falls back to the rolling window when the anchor is zero (absent-field default)', () => {
        // Regression: a Hybrid order with auctionTargetBlock=0 must not anchor
        // the search to block zero -- that turns the lookup into an unbounded
        // getLogs from genesis. Zero is an absent field's default, not a block.
        const order: any = { type: OrderType.Hybrid, cosignerData: { auctionTargetBlock: 0 } }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5000)
        expect(fromBlock).toBe(5000 - OVERLAP)
      })

      it('falls back to the rolling window when the Priority anchor computes non-positive', () => {
        const order: any = { type: OrderType.Priority, cosignerData: { auctionTargetBlock: 0 } }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5000)
        expect(fromBlock).toBe(5000 - OVERLAP)
      })

      it('never returns a negative lower bound', () => {
        const order: any = { type: OrderType.Dutch }
        const fromBlock = (checkOrderStatusService as any).getFillSearchFromBlock(order, 1, 5)
        expect(fromBlock).toBe(0)
      })
    })

    describe('fill-search window capping (getFillSearchToBlock)', () => {
      it('caps the upper bound by the order lifetime so anchored searches cannot grow unbounded', () => {
        // Mainnet ~12s blocks: a 120s-lived order needs ~10 blocks; the cap is
        // from + 2*lifespan + slack, far below a head that has drifted 100k
        // blocks past the anchor.
        const order: any = { createdAt: 1_000_000, deadline: 1_000_120 }
        const toBlock = (checkOrderStatusService as any).getFillSearchToBlock(order, 1, 1000, 101_000)
        expect(toBlock).toBeLessThan(101_000)
        expect(toBlock).toBeGreaterThan(1000)
      })

      it('uses the current head for young orders', () => {
        const order: any = { createdAt: 1_000_000, deadline: 1_000_120 }
        const toBlock = (checkOrderStatusService as any).getFillSearchToBlock(order, 1, 1000, 1100)
        expect(toBlock).toBe(1100)
      })

      it('uses the current head when lifetime cannot be bounded', () => {
        const order: any = { createdAt: undefined, deadline: 1_000_120 }
        const toBlock = (checkOrderStatusService as any).getFillSearchToBlock(order, 1, 1000, 500_000)
        expect(toBlock).toBe(500_000)
      })

      it('uses the current head on chains without a registered block time (testnets)', () => {
        // getAverageBlockTimeSecs throws for chains missing from its registry
        // (e.g. Sepolia); the cap must degrade to the old uncapped behavior
        // instead of failing the poll before the fill lookup.
        const order: any = { createdAt: 1_000_000, deadline: 1_000_120 }
        const toBlock = (checkOrderStatusService as any).getFillSearchToBlock(order, 11155111, 1000, 500_000)
        expect(toBlock).toBe(500_000)
      })
    })

    describe('Other Validations', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.OK)
      })

      it('should not update', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'open',
          })
        )
      })
    })

    describe('OrderType', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.Expired)
      })
      it('should close with filled for Dutch_V2 orderType', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
            {
              orderHash: MOCK_ORDER_HASH,
              filler: '0x123',
              nonce: BigNumber.from(1),
              swapper: '0x123',
              blockNumber: 12321312313,
              txHash: '0x1244345323',
              inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
              outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
            },
          ]
        })

        openOrderRequest.orderType = OrderType.Dutch_V2
        ordersRepositoryMock.getByHash.mockResolvedValue(MOCK_V2_ORDER_ENTITY)

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '10000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })
      it('should close with filled for Limit orderType', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
            {
              orderHash: MOCK_ORDER_HASH,
              filler: '0x123',
              nonce: BigNumber.from(1),
              swapper: '0x123',
              blockNumber: 12321312313,
              txHash: '0x1244345323',
              inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
              outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
            },
          ]
        })

        openOrderRequest.orderType = OrderType.Limit

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })
    })
  })
})
