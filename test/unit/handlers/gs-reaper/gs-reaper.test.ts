/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { OrderType, REACTOR_ADDRESS_MAPPING, OrderValidation } from '@uniswap/uniswapx-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { deleteStaleOrders } from '../../../../lib/crons/gs-reaper'
import { ORDER_STATUS } from '../../../../lib/entities'
import { DutchOrdersRepository } from '../../../../lib/repositories/dutch-orders-repository'
import { BLOCK_RANGE, REAPER_RANGES_PER_RUN, OLDEST_BLOCK_BY_CHAIN, REAPER_MAX_ATTEMPTS } from '../../../../lib/util/constants'
import { ChainId } from '../../../../lib/util/chain'
import { cleanupOrphanedOrders } from '../../../../lib/crons/gs-reaper'
import { MOCK_ORDER_ENTITY, MOCK_V2_ORDER_ENTITY } from '../../../test-data'
import { handler } from '../../../../lib/crons/gs-reaper'
import { parseOrder } from '../../../../lib/handlers/OrderParser'
import * as AWS from 'aws-sdk'

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

// Setup mock provider
const mockProviders = new Map<ChainId, ethers.providers.StaticJsonRpcProvider>()
for (const chainIdKey of Object.keys(OLDEST_BLOCK_BY_CHAIN)) {
  const chainId = Number(chainIdKey)
  const mockProvider = {
    getBlockNumber: jest.fn().mockResolvedValue(OLDEST_BLOCK_BY_CHAIN[chainId] + BLOCK_RANGE * REAPER_RANGES_PER_RUN),
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

const mockMetrics = {
  setNamespace: jest.fn(),
  setDimensions: jest.fn(),
  putMetric: jest.fn(),
}

// Mock the aws-embedded-metrics module
jest.mock('aws-embedded-metrics', () => ({
  metricScope: (handler: Function) => {
    return (event: any) => handler(mockMetrics)(event)
  },
  Unit: {
    Count: 'Count'
  }
}))

// Add AWS SDK mock before other mocks
jest.mock('aws-sdk', () => {
  return {
    config: {
      update: jest.fn()
    },
    DynamoDB: {
      DocumentClient: jest.fn().mockImplementation(() => ({
      }))
    }
  }
})

// Add mock for DutchOrdersRepository.create before the describe block
jest.mock('../../../../lib/repositories/dutch-orders-repository', () => ({
  DutchOrdersRepository: {
    create: jest.fn().mockImplementation(() => mockOrdersRepository)
  }
}))

describe('gs-reaper handler', () => {
  beforeEach(async () => {
    // Configure AWS
    AWS.config.update({
      region: 'local-env',
      credentials: {
        accessKeyId: 'fakeMyKeyId',
        secretAccessKey: 'fakeSecretAccessKey'
      }
    })

    // Set up RPC URLs for each chain
    Object.keys(OLDEST_BLOCK_BY_CHAIN).forEach(chainId => {
      process.env[`RPC_${chainId}`] = `https://dummy-rpc-${chainId}.example.com`
    })

    // Add test order to repository
    await mockOrdersRepository.addOrder(MOCK_ORDER_ENTITY)
    mockWatcher.getFillEvents.mockResolvedValue([{ orderHash: MOCK_V2_ORDER_ENTITY.orderHash }, { orderHash: MOCK_ORDER_ENTITY.orderHash }])
    
    // Clear metrics mocks
    mockMetrics.setNamespace.mockClear()
    mockMetrics.setDimensions.mockClear()
    mockMetrics.putMetric.mockClear()
  })

  afterEach(async () => {
    mockOrdersRepository.orders.clear()
    jest.clearAllMocks()
  })

  it('initializes state correctly from EventBridge event', async () => {
    const eventBridgeEvent = { time: new Date().toISOString() }
    const result = await handler(eventBridgeEvent)

    expect(result).toEqual({
      chainId: ChainId.MAINNET, // Mainnet is the first chain in the list
      currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
      orderUpdates: {},
      orderHashes: [],
      stage: 'GET_OPEN_ORDERS'
    })
  })

  it('processes GET_OPEN_ORDERS stage correctly', async () => {
    const initialState = {
      chainId: ChainId.MAINNET,
      currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
      orderUpdates: {},
      orderHashes: [],
      stage: 'GET_OPEN_ORDERS' as const
    }

    const result = await handler(initialState)

    expect(result.stage).toBe('PROCESS_BLOCKS')
    expect(result.orderHashes).toBeDefined()
    // orderHashes should contain our mock order
    expect(result.orderHashes.includes(MOCK_ORDER_ENTITY.orderHash)).toBe(true)
  })

  it('processes PROCESS_BLOCKS stage correctly', async () => {
    const state = {
      chainId: ChainId.MAINNET,
      currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
      orderUpdates: {},
      orderHashes: [MOCK_ORDER_ENTITY.orderHash],
      stage: 'PROCESS_BLOCKS' as const
    }

    const result = await handler(state)

    expect(result.stage).toBe('CHECK_CANCELLED')
    expect(result.currentBlock).toBe(OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET])
    expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
    expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash].status).toBe(ORDER_STATUS.FILLED)
    // Verify order was removed from parsedOrders
    expect(result.orderHashes.includes(MOCK_ORDER_ENTITY.orderHash)).toBe(false)
  })

  it('processes CHECK_CANCELLED stage correctly', async () => {
    const state = {
      chainId: ChainId.MAINNET,
      currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
      orderUpdates: {},
      orderHashes: [MOCK_ORDER_ENTITY.orderHash],
      stage: 'CHECK_CANCELLED' as const
    }

    // Update the OrderValidator mock to return NonceUsed
    const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
    const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
    mockOrderValidator.mockImplementation(() => ({
      validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
    }))

    const result = await handler(state)

    expect(result.stage).toBe('UPDATE_DB')
    expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
    expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash].status).toBe(ORDER_STATUS.CANCELLED)
  })

  it('processes UPDATE_DB stage correctly and moves to next chain', async () => {
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
      stage: 'UPDATE_DB' as const
    }

    const result = await handler(state)

    // Verify the order was updated in the repository
    const updatedOrder = await mockOrdersRepository.getOrder(MOCK_ORDER_ENTITY.orderHash)
    expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.FILLED)
    expect(updatedOrder?.txHash).toBe('0xmocktxhash')
    expect(updatedOrder?.fillBlock).toBe(mockFillBlockNumber)

    // Verify we're moving to the next chain
    const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
    expect(result.chainId).toBe(chainIds[chainIds.indexOf(ChainId.MAINNET) + 1])
    expect(result.stage).toBe('GET_OPEN_ORDERS')
  })

  it('returns undefined when processing UPDATE_DB stage for the last chain', async () => {
    const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
    const lastChainId = chainIds[chainIds.length - 1]

    const state = {
      chainId: lastChainId,
      currentBlock: OLDEST_BLOCK_BY_CHAIN[lastChainId],
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[lastChainId],
      orderUpdates: {},
      orderHashes: [],
      stage: 'UPDATE_DB' as const
    }

    const result = await handler(state)
    expect(result).toBeUndefined()
  })

  describe('error handling', () => {
    it('handles provider errors with retry logic', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        stage: 'PROCESS_BLOCKS' as const
      }

      // Simulate provider errors with eventual success
      mockWatcher.getFillEvents
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce([{ orderHash: MOCK_ORDER_ENTITY.orderHash }])

      const result = await handler(state)
      const reactorCount = Object.keys(REACTOR_ADDRESS_MAPPING[ChainId.MAINNET])
        .filter(orderType => REACTOR_ADDRESS_MAPPING[ChainId.MAINNET][orderType as OrderType] !== "0x0000000000000000000000000000000000000000")
        .length
      // 2 failures
      expect(mockWatcher.getFillEvents).toHaveBeenCalledTimes(REAPER_RANGES_PER_RUN * reactorCount + 2)
      expect(mockMetrics.putMetric).not.toHaveBeenCalledWith('GetFillEventsError', 1)
      expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeDefined()
    })

    it('handles max retries exceeded', async () => {
      const state = {
        chainId: ChainId.MAINNET,
        currentBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE * REAPER_RANGES_PER_RUN + 1,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET],
        orderUpdates: {},
        orderHashes: [MOCK_ORDER_ENTITY.orderHash],
        stage: 'PROCESS_BLOCKS' as const
      }

      // Simulate persistent provider errors
      mockWatcher.getFillEvents.mockRejectedValue(new Error('Rate limit'))

      const result = await handler(state)

      expect(mockWatcher.getFillEvents).toHaveBeenCalledTimes(REAPER_RANGES_PER_RUN * REAPER_MAX_ATTEMPTS)
      expect(mockMetrics.putMetric).toHaveBeenCalledWith('GetFillEventsError', 1, 'Count')
      // Should continue processing despite errors
      expect(result.stage).toBe('PROCESS_BLOCKS')
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
        stage: 'PROCESS_BLOCKS' as const
      }

      const result = await handler(state)

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
        stage: 'CHECK_CANCELLED' as const
      }

      // Simulate order not found in DB
      mockOrdersRepository.getByHash.mockResolvedValueOnce(null)

      const result = await handler(state)

      expect(result.orderUpdates[MOCK_ORDER_ENTITY.orderHash]).toBeUndefined()
      // Should continue processing despite errors
      expect(result.stage).toBe('UPDATE_DB')
    })
  })
})
