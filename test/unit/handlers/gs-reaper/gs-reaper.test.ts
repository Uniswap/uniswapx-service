/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { OrderType, REACTOR_ADDRESS_MAPPING, OrderValidation, PermissionedTokenValidator } from '@uniswap/uniswapx-sdk'
import { Permit2Validator } from '../../../../lib/util/Permit2Validator'
import { default as bunyan, default as Logger } from 'bunyan'
import { estimateFillWindow, GSReaper, ReaperStage } from '../../../../lib/crons/gs-reaper/gs-reaper'
import { ORDER_STATUS } from '../../../../lib/entities'
import { BLOCK_RANGE, REAPER_RANGES_PER_RUN, OLDEST_BLOCK_BY_CHAIN, REAPER_MAX_ATTEMPTS, BLOCKS_IN_24_HOURS } from '../../../../lib/util/constants'
import { ChainId } from '../../../../lib/util/chain'
import { MOCK_ORDER_ENTITY, MOCK_V2_ORDER_ENTITY } from '../../../test-data'

const log: Logger = bunyan.createLogger({
  name: 'test',
  serializers: bunyan.stdSerializers,
  level: 'fatal',
})

const mockOrdersRepository = {
  orders: new Map(),

  addOrder: jest.fn(async (order) => {
    mockOrdersRepository.orders.set(order.orderHash, { ...order })
  }),

  getOrder: jest.fn(async (orderHash) => {
    return mockOrdersRepository.orders.get(orderHash) || null
  }),

  getByHash: jest.fn(async (orderHash) => {
    return mockOrdersRepository.orders.get(orderHash) || null
  }),

  getOrders: jest.fn(async (limit, { orderStatus, chainId, cursor }) => {
    const matchingOrders = Array.from(mockOrdersRepository.orders.values())
      .filter(order => 
        order.orderStatus === orderStatus && 
        order.chainId === chainId
      )
      .slice(0, limit)
    
    return {
      orders: matchingOrders,
      cursor: undefined // Simplified cursor implementation for testing
    }
  }),

  updateOrderStatus: jest.fn(async (orderHash, status, txHash, fillBlock, settledAmounts) => {
    const order = mockOrdersRepository.orders.get(orderHash)
    if (order) {
      mockOrdersRepository.orders.set(orderHash, {
        ...order,
        orderStatus: status,
        txHash,
        fillBlock,
        settledAmounts
      })
    }
  })
}

// 2 weeks from oldest block to test the 1 week lookback
const getCurrentBlock = (chainId: ChainId) => {
  const blocksInTwoWeeks = BLOCKS_IN_24_HOURS(chainId) * 14
  return OLDEST_BLOCK_BY_CHAIN[chainId] + blocksInTwoWeeks
}

// Setup mock provider
const mockProviders = new Map<ChainId, ethers.providers.StaticJsonRpcProvider>()
for (const chainIdKey of Object.keys(OLDEST_BLOCK_BY_CHAIN)) {
  const chainId = Number(chainIdKey)
  const currentBlock = getCurrentBlock(chainId)
  const mockProvider = {
    getBlockNumber: jest.fn().mockResolvedValue(currentBlock),
    getTransaction: jest.fn().mockResolvedValue({
      gasPrice: '1000000000',
      maxPriorityFeePerGas: null,
      maxFeePerGas: null,
    }),
    getBlock: jest.fn().mockResolvedValue({
      timestamp: Date.now() / 1000,
    }),
  }
  mockProviders.set(chainId, mockProvider as unknown as ethers.providers.StaticJsonRpcProvider);
}

// Mock ethers
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  ethers: {
    ...jest.requireActual('ethers').ethers,
    providers: {
      StaticJsonRpcProvider: jest.fn().mockImplementation((url, chainId) => {
        return mockProviders.get(chainId)
      })
    }
  }
}))

// Setup mock watcher
const mockFillBlockNumber = OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE/2
const mockWatcher = {
  getFillEvents: jest.fn().mockImplementation(async (chainId, fromBlock, toBlock) => {
    // Only return events if the block range matches expected range
    if (mockFillBlockNumber >= fromBlock && mockFillBlockNumber <= toBlock) {
      return [
        { orderHash: MOCK_ORDER_ENTITY.orderHash },
        { orderHash: MOCK_V2_ORDER_ENTITY.orderHash },
      ]
    }
    return []
  }),
  getFillInfo: jest.fn().mockResolvedValue([{
    orderHash: MOCK_ORDER_ENTITY.orderHash,
    txHash: '0xmocktxhash',
    blockNumber: mockFillBlockNumber,
  },
  {
    orderHash: MOCK_V2_ORDER_ENTITY.orderHash,
    txHash: '0xmocktxhash2',
    blockNumber: mockFillBlockNumber,
  }]),
}

// Mock the UniswapXEventWatcher constructor
jest.mock('@uniswap/uniswapx-sdk', () => {
  const actual = jest.requireActual('@uniswap/uniswapx-sdk');
  return {
    ...actual,
    UniswapXEventWatcher: jest.fn().mockImplementation(() => mockWatcher),
    OrderValidator: jest.fn().mockImplementation(() => ({
      validate: jest.fn().mockResolvedValue(actual.OrderValidation.OK)
    })),
    OrderValidation: actual.OrderValidation  // Ensure we're using the actual enum
  }
})
    
// Mock the getSettledAmounts function
jest.mock('../../../../lib/handlers/check-order-status/util', () => {
  // Get reference to actual test-data import
  const testData = jest.requireActual('../../../test-data')

  return {
    ...jest.requireActual('../../../../lib/handlers/check-order-status/util'),
    getSettledAmounts: jest.fn().mockReturnValue([
      {
        tokenOut: testData.MOCK_ORDER_ENTITY.outputs[0].token,
        amountOut: testData.MOCK_ORDER_ENTITY.outputs[0].startAmount,
        tokenIn: testData.MOCK_ORDER_ENTITY.input.token,
        amountIn: testData.MOCK_ORDER_ENTITY.input.startAmount,
      }
    ])
  }
})


// Mock Permit2Validator
jest.mock('../../../../lib/util/Permit2Validator', () => ({
  Permit2Validator: jest.fn()
}))

// Mock EMF metrics so flush() doesn't probe for a metrics environment in tests
jest.mock('aws-embedded-metrics', () => ({
  Unit: { Count: 'Count' },
  createMetricsLogger: jest.fn().mockImplementation(() => ({
    setNamespace: jest.fn(),
    setDimensions: jest.fn(),
    putMetric: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}))

// Add mock for DutchOrdersRepository.create before the describe block
jest.mock('../../../../lib/repositories/dutch-orders-repository', () => ({
  DutchOrdersRepository: {
    create: jest.fn().mockImplementation(() => mockOrdersRepository)
  }
}))

describe('GSReaper', () => {
  let reaper: GSReaper

  beforeEach(async () => {
    process.env.RPC_PREFIX_URL = 'https://dummy-rpc.example.com'

    // Add test order to repository
    await mockOrdersRepository.addOrder(MOCK_ORDER_ENTITY)
    mockWatcher.getFillEvents.mockResolvedValue([{ orderHash: MOCK_V2_ORDER_ENTITY.orderHash }, { orderHash: MOCK_ORDER_ENTITY.orderHash }])
    mockWatcher.getFillInfo.mockResolvedValue([{
      orderHash: MOCK_ORDER_ENTITY.orderHash,
      txHash: '0xmocktxhash',
      blockNumber: mockFillBlockNumber,
    },
    {
      orderHash: MOCK_V2_ORDER_ENTITY.orderHash,
      txHash: '0xmocktxhash2',
      blockNumber: mockFillBlockNumber,
    }])
    
    // Create new reaper instance with OPEN status
    reaper = new GSReaper(mockOrdersRepository, ORDER_STATUS.OPEN)
  })

  afterEach(async () => {
    mockOrdersRepository.orders.clear()
    jest.clearAllMocks()
  })

  describe('constructor with different order statuses', () => {
    it('creates reaper with OPEN status', () => {
      const openReaper = new GSReaper(mockOrdersRepository, ORDER_STATUS.OPEN)
      expect(openReaper).toBeDefined()
    })

    it('creates reaper with INSUFFICIENT_FUNDS status', () => {
      const insufficientFundsReaper = new GSReaper(mockOrdersRepository, ORDER_STATUS.INSUFFICIENT_FUNDS)
      expect(insufficientFundsReaper).toBeDefined()
    })
  })

  describe('order status filtering', () => {
    it('filters orders by OPEN status', async () => {
      // Add orders with different statuses
      await mockOrdersRepository.addOrder({
        ...MOCK_ORDER_ENTITY,
        orderHash: 'open-order-hash',
        orderStatus: ORDER_STATUS.OPEN
      })
      await mockOrdersRepository.addOrder({
        ...MOCK_ORDER_ENTITY,
        orderHash: 'insufficient-funds-order-hash',
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS
      })

      const openReaper = new GSReaper(mockOrdersRepository, ORDER_STATUS.OPEN)
      const state = await openReaper.initializeChainState(ChainId.MAINNET)
      
      const result = await openReaper.processChainState({
        ...state,
        failedFillScanRanges: [],
        stage: ReaperStage.GET_OPEN_ORDERS
      })

      expect(result?.orderHashes).toContain('open-order-hash')
      expect(result?.orderHashes).not.toContain('insufficient-funds-order-hash')
    })

    it('filters orders by INSUFFICIENT_FUNDS status', async () => {
      // Add orders with different statuses
      await mockOrdersRepository.addOrder({
        ...MOCK_ORDER_ENTITY,
        orderHash: 'open-order-hash',
        orderStatus: ORDER_STATUS.OPEN
      })
      await mockOrdersRepository.addOrder({
        ...MOCK_ORDER_ENTITY,
        orderHash: 'insufficient-funds-order-hash',
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS
      })

      const insufficientFundsReaper = new GSReaper(mockOrdersRepository, ORDER_STATUS.INSUFFICIENT_FUNDS)
      const state = await insufficientFundsReaper.initializeChainState(ChainId.MAINNET)
      
      const result = await insufficientFundsReaper.processChainState({
        ...state,
        failedFillScanRanges: [],
        stage: ReaperStage.GET_OPEN_ORDERS
      })

      expect(result?.orderHashes).toContain('insufficient-funds-order-hash')
      expect(result?.orderHashes).not.toContain('open-order-hash')
    })
  })

  describe('state machine', () => {
    it('initializes first chain state correctly', async () => {
      const state = await reaper.initializeChainState(ChainId.MAINNET)
      const currentBlock = getCurrentBlock(ChainId.MAINNET)
      
      expect(state).toEqual({
        chainId: ChainId.MAINNET,
        currentBlock,
        earliestBlock: currentBlock - (BLOCKS_IN_24_HOURS(ChainId.MAINNET) * 7),
        orderUpdates: {},
        orderHashes: [],
        failedFillScanRanges: [],
        stage: ReaperStage.GET_OPEN_ORDERS
      })
    })

    it('processes GET_OPEN_ORDERS stage correctly', async () => {
      const initialState = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [],
        failedFillScanRanges: [],
        stage: ReaperStage.GET_OPEN_ORDERS
      }

      const result = await reaper.processChainState(initialState)

      expect(result?.stage).toBe(ReaperStage.PROCESS_BLOCKS)
      expect(result?.orderHashes).toBeDefined()
      // orderHashes should contain our mock order
      expect(result?.orderHashes.includes(MOCK_ORDER_ENTITY.orderHash)).toBe(true)
    })

    it('processes PROCESS_BLOCKS stage correctly', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.CHECK_CANCELLED)
      expect(result?.currentBlock).toBe(OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET])
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash].status).toBe(ORDER_STATUS.FILLED)
      // Verify order was removed from parsedOrders
      expect(result?.orderHashes.includes(MOCK_ORDER_ENTITY.orderHash)).toBe(false)
    })

    it('processes CHECK_CANCELLED stage correctly', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      // Update the OrderValidator mock to return NonceUsed
      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash].status).toBe(ORDER_STATUS.CANCELLED)
    })

    it('does NOT resolve an order whose DB status changed since the run snapshot', async () => {
      // Regression (PROTO-1201): the run's order-hash snapshot is taken in
      // GET_OPEN_ORDERS, but another writer (e.g. the check-order-status state
      // machine) can resolve the order -- most importantly to FILLED -- before
      // CHECK_CANCELLED validates it. A used nonce is consistent with that
      // fill, so the reaper must re-check the CURRENT DB status and skip
      // orders that already moved on, instead of clobbering FILLED with
      // CANCELLED.
      await mockOrdersRepository.addOrder({
        ...MOCK_ORDER_ENTITY,
        orderStatus: ORDER_STATUS.FILLED,
      })

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
    })

    it('does NOT mark a used-nonce order CANCELLED when a failed scan range may hide its fill', async () => {
      // Regression: a used nonce is consistent with both a fill and a cancel.
      // MOCK_ORDER_ENTITY has no createdAt, so its fill window cannot be
      // bounded -- any failed range must be treated as possibly hiding the
      // fill, and we defer rather than misclassify a filled order as CANCELLED.
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [
          { lowBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET], highBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE },
        ],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      // Order is left unresolved (no update) so a later run with full fill
      // visibility can resolve it correctly.
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
    })

    it('does NOT mark an expired order EXPIRED when a failed scan range may hide its fill', async () => {
      // Same misclassification class as the used-nonce case: don't finalize a
      // terminal status while fill visibility over the order's window is
      // incomplete.
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [
          { lowBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET], highBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE },
        ],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.Expired)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
    })

    it('defers a used-nonce order whose bounded fill window OVERLAPS a failed range', async () => {
      // Pins the estimateFillWindow + rangesOverlap mechanism itself (not the
      // unbounded-window fallback): the order's timestamps place its fill
      // window over the failed range, so it must be deferred.
      const nowSec = Math.floor(Date.now() / 1000)
      const overlappedOrder = {
        ...MOCK_ORDER_ENTITY,
        orderHash: '0xoverlappedorderhash',
        createdAt: nowSec - 3600,
        deadline: nowSec - 3000,
      }
      await mockOrdersRepository.addOrder(overlappedOrder)
      const chainHead = getCurrentBlock(ChainId.MAINNET)

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [overlappedOrder.orderHash],
        // Just below the chain head -- inside the hour-old order's estimated
        // fill window.
        failedFillScanRanges: [{ lowBlock: chainHead - 2000, highBlock: chainHead - 1000 }],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[overlappedOrder.orderHash]).toBeUndefined()
    })

    it('defers a used-nonce order whose deadline is too recent for this scan snapshot', async () => {
      // A fill can land right up to the deadline, after the run's scan already
      // walked those blocks; resolving now would misread it as a cancellation.
      const nowSec = Math.floor(Date.now() / 1000)
      const freshOrder = {
        ...MOCK_ORDER_ENTITY,
        orderHash: '0xfreshorderhash',
        createdAt: nowSec - 120,
        deadline: nowSec + 60,
      }
      await mockOrdersRepository.addOrder(freshOrder)

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [freshOrder.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[freshOrder.orderHash]).toBeUndefined()
    })

    it('still cancels a used-nonce order whose fill window cannot overlap the failed range', async () => {
      // Granularity: one failed range must not poison resolution for the whole
      // chain. An order created long after the failed (very old) range cannot
      // have its fill hidden there, so it can still be resolved this run.
      const nowSec = Math.floor(Date.now() / 1000)
      const recentOrder = {
        ...MOCK_ORDER_ENTITY,
        orderHash: '0xrecentorderhash',
        createdAt: nowSec - 3600,
        deadline: nowSec - 3000,
      }
      await mockOrdersRepository.addOrder(recentOrder)

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [recentOrder.orderHash],
        // ~2 weeks of blocks below the chain head in this suite -- far outside
        // the hour-old order's estimated fill window.
        failedFillScanRanges: [
          { lowBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET], highBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE },
        ],
        stage: ReaperStage.CHECK_CANCELLED
      }

      const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      mockOrderValidator.mockImplementation(() => ({
        validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
      }))

      const result = await reaper.processChainState(state)

      expect(result?.stage).toBe(ReaperStage.UPDATE_DB)
      expect(result?.orderUpdates[recentOrder.orderHash]?.status).toBe(ORDER_STATUS.CANCELLED)
    })

    it('records the failed range when a range scan exhausts retries', async () => {
      // If getFillEvents fails all attempts for a range, the run must remember
      // the range so CHECK_CANCELLED defers resolutions it could be hiding.
      mockWatcher.getFillEvents.mockRejectedValue(new Error('limit exceeded'))

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      const result = await reaper.processChainState(state)

      expect(result?.failedFillScanRanges).toEqual([
        {
          lowBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
          highBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        },
      ])
    })

    it('records the failed range when a fill event is observed but cannot be processed', async () => {
      // The fill event was literally seen -- if enriching it fails (e.g. the
      // second getFillInfo getLogs call), the order must not fall through to
      // CHECK_CANCELLED as if the range were cleanly scanned.
      mockWatcher.getFillInfo.mockRejectedValue(new Error('limit exceeded'))

      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      const result = await reaper.processChainState(state)

      // No FILLED update was written...
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
      // ...so the range must be flagged failed to defer the order's resolution.
      expect(result?.failedFillScanRanges).toEqual([
        {
          lowBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
          highBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        },
      ])
    })

    it('processes UPDATE_DB stage and moves to next chain', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {
          [MOCK_ORDER_ENTITY.orderHash]: {
            status: ORDER_STATUS.FILLED,
            txHash: '0xmocktxhash',
            fillBlock: mockFillBlockNumber
          }
        },
        orderHashes: [],
        failedFillScanRanges: [],
        stage: ReaperStage.UPDATE_DB
      }

      const result = await reaper.processChainState(state)

      // Verify the order was updated in the repository
      const updatedOrder = await mockOrdersRepository.getOrder(MOCK_ORDER_ENTITY.orderHash)
      expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.FILLED)
      expect(updatedOrder?.txHash).toBe('0xmocktxhash')
      expect(updatedOrder?.fillBlock).toBe(mockFillBlockNumber)

      // Verify we're moving to the next chain
      const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
      expect(result?.chainId).toBe(chainIds[chainIds.indexOf(ChainId.MAINNET) + 1])
      expect(result?.stage).toBe(ReaperStage.GET_OPEN_ORDERS)
    })

    it('returns null when processing UPDATE_DB stage for the last chain', async () => {
      const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
      const lastChainId = chainIds[chainIds.length - 1]

      const state = {
        chainId: lastChainId,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[lastChainId],
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[lastChainId],
        orderUpdates: {},
        orderHashes: [],
        failedFillScanRanges: [],
        stage: ReaperStage.UPDATE_DB
      }

      const result = await reaper.processChainState(state)
      expect(result).toBeNull()
    })
  })

  describe('error handling', () => {
    it('handles provider errors with retry logic', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      // Simulate provider errors with eventual success
      mockWatcher.getFillEvents
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce([{ orderHash: MOCK_ORDER_ENTITY.orderHash }])

      const result = await reaper.processChainState(state)
      const reactorCount = Object.keys(REACTOR_ADDRESS_MAPPING[ChainId.MAINNET])
        .filter(orderType => REACTOR_ADDRESS_MAPPING[ChainId.MAINNET][orderType as OrderType] !== "0x0000000000000000000000000000000000000000")
        .length
      // 2 failures
      expect(mockWatcher.getFillEvents).toHaveBeenCalledTimes(REAPER_RANGES_PER_RUN * reactorCount + 2)
      expect(result?.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
    })

    it('handles max retries exceeded', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN + 1,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      // Simulate persistent provider errors
      mockWatcher.getFillEvents.mockRejectedValue(new Error('Rate limit'))

      const result = await reaper.processChainState(state)

      expect(mockWatcher.getFillEvents).toHaveBeenCalledTimes(REAPER_RANGES_PER_RUN * REAPER_MAX_ATTEMPTS)
      // Should continue processing despite errors
      expect(result.stage).toBe(ReaperStage.PROCESS_BLOCKS)
    })
  })

  describe('block range processing', () => {
    it('processes multiple ranges before returning', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + (BLOCK_RANGE * REAPER_RANGES_PER_RUN),
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.PROCESS_BLOCKS
      }

      const result = await reaper.processChainState(state)

      const reactorCount = Object.keys(REACTOR_ADDRESS_MAPPING[ChainId.MAINNET])
        .filter(orderType => REACTOR_ADDRESS_MAPPING[ChainId.MAINNET][orderType as OrderType] !== "0x0000000000000000000000000000000000000000")
        .length
      expect(mockWatcher.getFillEvents).toHaveBeenCalledTimes(REAPER_RANGES_PER_RUN * reactorCount)
      expect(result.currentBlock).toBe(state.currentBlock - (BLOCK_RANGE * REAPER_RANGES_PER_RUN))
    })
  })

  describe('order processing', () => {
    it('handles failed order fetches gracefully', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      // Simulate order not found in DB
      mockOrdersRepository.getByHash.mockResolvedValueOnce(null)

      const result = await reaper.processChainState(state)

      expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
      // Should continue processing despite errors
      expect(result.stage).toBe(ReaperStage.UPDATE_DB)
    })

    it('should call Permit2Validator.validate for permissioned tokens', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      // Mock that the token is permissioned
      jest.spyOn(PermissionedTokenValidator, 'isPermissionedToken').mockReturnValue(true)

      // Mock Permit2Validator to track if validate is called
      const mockPermit2Validator = {
        validate: jest.fn().mockResolvedValue(OrderValidation.OK)
      }
      Permit2Validator.mockImplementation(() => mockPermit2Validator)

      // Mock OrderValidator to track if validate is called
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      const orderValidatorValidateMock = jest.fn().mockResolvedValue(OrderValidation.OK)
      mockOrderValidator.mockImplementation(() => ({
        validate: orderValidatorValidateMock
      }))

      const result = await reaper.processChainState(state)

      // Verify that Permit2Validator.validate was called since it's a permissioned token
      expect(mockPermit2Validator.validate).toHaveBeenCalledWith(expect.any(Object))
      
      // Verify that quoter.validate was NOT called since it's a permissioned token
      expect(orderValidatorValidateMock).not.toHaveBeenCalled()
      expect(result.stage).toBe(ReaperStage.UPDATE_DB)
    })

    it('estimateFillWindow returns undefined when creation time is unknown', () => {
      expect(estimateFillWindow({ deadline: 100 }, 1_000_000, ChainId.MAINNET, 2_000_000)).toBeUndefined()
    })

    it('estimateFillWindow keeps the deadline edge above the creation edge, widened outward', () => {
      const NOW = 2_000_000
      const HEAD = 1_000_000
      // mainnet ~12s blocks: created ~600 blocks ago, deadline ~300 blocks ago
      const window = estimateFillWindow({ createdAt: NOW - 7200, deadline: NOW - 3600 }, HEAD, ChainId.MAINNET, NOW)
      expect(window.lowBlock).toBeLessThan(HEAD - 600)
      expect(window.highBlock).toBeGreaterThan(HEAD - 300)
      expect(window.lowBlock).toBeLessThan(window.highBlock)
    })

    it('estimateFillWindow extends past the head when the deadline is still ahead', () => {
      const NOW = 2_000_000
      const HEAD = 1_000_000
      const window = estimateFillWindow({ createdAt: NOW - 60, deadline: NOW + 300 }, HEAD, ChainId.MAINNET, NOW)
      expect(window.highBlock).toBeGreaterThan(HEAD)
    })

    it('should call quoter.validate for non-permissioned tokens', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        failedFillScanRanges: [],
        stage: ReaperStage.CHECK_CANCELLED
      }

      // Mock that the token is NOT permissioned
      jest.spyOn(PermissionedTokenValidator, 'isPermissionedToken').mockReturnValue(false)

      // Mock OrderValidator to track if validate is called
      const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
      const validateMock = jest.fn().mockResolvedValue(OrderValidation.OK)
      mockOrderValidator.mockImplementation(() => ({
        validate: validateMock
      }))

      const result = await reaper.processChainState(state)

      // Verify quoter.validate is called
      expect(validateMock).toHaveBeenCalledWith({
        order: expect.any(Object),
        signature: expect.any(String)
      })
      expect(result.stage).toBe(ReaperStage.UPDATE_DB)
    })
  })
})