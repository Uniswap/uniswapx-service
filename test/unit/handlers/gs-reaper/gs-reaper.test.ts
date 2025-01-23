/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { OrderType, REACTOR_ADDRESS_MAPPING, OrderValidation } from '@uniswap/uniswapx-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { deleteStaleOrders } from '../../../../lib/crons/gs-reaper'
import { ORDER_STATUS } from '../../../../lib/entities'
import { DutchOrdersRepository } from '../../../../lib/repositories/dutch-orders-repository'
import { BLOCK_RANGE, OLDEST_BLOCK_BY_CHAIN } from '../../../../lib/util/constants'
import { ChainId } from '../../../../lib/util/chain'
import { cleanupOrphanedOrders } from '../../../../lib/crons/gs-reaper'
import { MOCK_ORDER_ENTITY } from '../../../test-data'

const dynamoConfig = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
}

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
const mockProvider = {
  getBlockNumber: jest.fn().mockResolvedValue(OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE),
  getTransaction: jest.fn().mockResolvedValue({
    gasPrice: '1000000000',
    maxPriorityFeePerGas: null,
    maxFeePerGas: null,
  }),
  getBlock: jest.fn().mockResolvedValue({
    timestamp: MOCK_ORDER_ENTITY.decayStartTime,
  }),
}
const mockProviders = new Map<ChainId, ethers.providers.StaticJsonRpcProvider>()
mockProviders.set(ChainId.MAINNET, mockProvider);

// Setup mock watcher
const mockFillBlockNumber = OLDEST_BLOCK_BY_CHAIN[ChainId.MAINNET] + BLOCK_RANGE/2
const mockWatcher = {
  getFillEvents: jest.fn().mockResolvedValue([{ orderHash: MOCK_ORDER_ENTITY.orderHash }]),
  getFillInfo: jest.fn().mockResolvedValue([{
    orderHash: MOCK_ORDER_ENTITY.orderHash,
    txHash: '0xmocktxhash',
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


describe('update filled orders', () => {
})

describe('cleanupOrphanedOrders', () => {
  beforeEach(async () => {
    // Add test order to repository
    await mockOrdersRepository.addOrder(MOCK_ORDER_ENTITY)
  })

  afterEach(async () => {
    mockOrdersRepository.orders.clear()
    jest.clearAllMocks()
  })

  it('updates order status to FILLED when matching fill event is found', async () => {
    await cleanupOrphanedOrders(mockOrdersRepository, mockProviders, log)

    // Verify order was updated
    const updatedOrder = await mockOrdersRepository.getOrder(MOCK_ORDER_ENTITY.orderHash)
    expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.FILLED)
    expect(updatedOrder?.txHash).toBe('0xmocktxhash')
    expect(updatedOrder?.fillBlock).toBe(mockFillBlockNumber)
    expect(updatedOrder?.settledAmounts).toBeDefined()
    expect(updatedOrder?.settledAmounts[0].tokenOut).toBe(MOCK_ORDER_ENTITY.outputs[0].token)
    expect(updatedOrder?.settledAmounts[0].amountOut).toBe(MOCK_ORDER_ENTITY.outputs[0].startAmount)
    expect(updatedOrder?.settledAmounts[0].tokenIn).toBe(MOCK_ORDER_ENTITY.input.token)
    expect(updatedOrder?.settledAmounts[0].amountIn).toBe(MOCK_ORDER_ENTITY.input.startAmount)
  })

  it('updates order status to CANCELLED when nonce is used', async () => {
    // Remove fill event from mock watcher
    mockWatcher.getFillEvents.mockResolvedValue([])
    
    // Update the OrderValidator mock implementation for this test
    const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
    const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
    mockOrderValidator.mockImplementation(() => ({
      validate: jest.fn().mockResolvedValue(OrderValidation.NonceUsed)
    }))

    await cleanupOrphanedOrders(mockOrdersRepository, mockProviders, log)

    // Verify order was updated
    const updatedOrder = await mockOrdersRepository.getOrder(MOCK_ORDER_ENTITY.orderHash)
    expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.CANCELLED)
    expect(updatedOrder?.txHash).not.toBeDefined()
    expect(updatedOrder?.fillBlock).not.toBeDefined()
    expect(updatedOrder?.settledAmounts).not.toBeDefined()
  })

  it('updates order status to EXPIRED when deadline has passed', async () => {
    // Remove fill event from mock watcher
    mockWatcher.getFillEvents.mockResolvedValue([])
    
    // Update the OrderValidator mock implementation for this test
    const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
    const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
    mockOrderValidator.mockImplementation(() => ({
      validate: jest.fn().mockResolvedValue(OrderValidation.Expired)
    }))

    await cleanupOrphanedOrders(mockOrdersRepository, mockProviders, log)

    // Verify order was updated
    const updatedOrder = await mockOrdersRepository.getOrder(MOCK_ORDER_ENTITY.orderHash)
    expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.EXPIRED)
    expect(updatedOrder?.txHash).not.toBeDefined()
    expect(updatedOrder?.fillBlock).not.toBeDefined()
    expect(updatedOrder?.settledAmounts).not.toBeDefined()
  })

  it('updates order status remains OPEN when not filled, cancelled, or expired', async () => {
    mockOrdersRepository.orders.clear()
    const unexpiredOrder = { ...MOCK_ORDER_ENTITY, deadline: Date.now() / 1000 + 10000 }
    await mockOrdersRepository.addOrder(unexpiredOrder)
    // Remove fill event from mock watcher
    mockWatcher.getFillEvents.mockResolvedValue([])
    
    // Update the OrderValidator mock implementation for this test
    const { OrderValidation } = jest.requireActual('@uniswap/uniswapx-sdk')
    const mockOrderValidator = jest.requireMock('@uniswap/uniswapx-sdk').OrderValidator
    mockOrderValidator.mockImplementation(() => ({
      validate: jest.fn().mockResolvedValue(OrderValidation.OK)
    }))

    await cleanupOrphanedOrders(mockOrdersRepository, mockProviders, log)

    // Verify order was updated
    const updatedOrder = await mockOrdersRepository.getOrder(unexpiredOrder.orderHash)
    expect(updatedOrder?.orderStatus).toBe(ORDER_STATUS.OPEN)
    expect(updatedOrder?.txHash).not.toBeDefined()
    expect(updatedOrder?.fillBlock).not.toBeDefined()
    expect(updatedOrder?.settledAmounts).not.toBeDefined()
  })
})