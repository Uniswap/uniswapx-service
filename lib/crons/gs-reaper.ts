import { EventBridgeEvent } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, QueryResult } from '../repositories/base'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import { BLOCK_RANGE, REAPER_MAX_ATTEMPTS, DYNAMO_BATCH_WRITE_MAX, OLDEST_BLOCK_BY_CHAIN, REAPER_RANGES_PER_RUN, RPC_HEADERS } from '../util/constants'
import { ethers } from 'ethers'
import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder, FillInfo, OrderType, OrderValidation, OrderValidator, REACTOR_ADDRESS_MAPPING, UniswapXEventWatcher, UniswapXOrder } from '@uniswap/uniswapx-sdk'
import { parseOrder } from '../handlers/OrderParser'
import { getSettledAmounts } from '../handlers/check-order-status/util'
import { ChainId } from '../util/chain'

type OrderUpdate = {
  status: ORDER_STATUS,
  txHash?: string,
  fillBlock?: number,
  settledAmounts?: SettledAmount[]
}

type StepFunctionState = {
  chainId: number
  currentBlock: number
  earliestBlock: number
  orderUpdates: Record<string, OrderUpdate>
  orderHashes: string[]
  stage: 'GET_OPEN_ORDERS' | 'PROCESS_BLOCKS' | 'CHECK_CANCELLED' | 'UPDATE_DB'
}

// Step functions have a max payload size of 256KB
// Avg parsed order size is 2KB so 50 orders ensures we stay well under the limit
const MAX_ORDERS_PER_CHAIN = 50

/**
 * Step Function Handler for the GS (Get Status) Reaper
 * 
 * This handler processes orphaned orders across multiple chains to update their statuses in the database.
 * It operates in the following stages:
 * 
 * 1. GET_OPEN_ORDERS:
 *    - Retrieves all open orders for the current chain from the database
 *    - Parses orders into UniswapX SDK format for validation
 * 
 * 2. PROCESS_BLOCKS:
 *    - Processes multiple block ranges (configured by REAPER_RANGES_PER_RUN)
 *    - For each range, checks for fill events of open orders
 *    - If an order is filled, records the transaction details and settled amounts
 *    - Continues until reaching the earliest block or completing configured ranges
 * 
 * 3. CHECK_CANCELLED:
 *    - Validates remaining unfilled orders for the chain
 *    - Marks orders as CANCELLED if their nonce was used
 *    - Marks orders as EXPIRED if they've passed their deadline
 * 
 * 4. UPDATE_DB:
 *    - Writes all status updates to the database
 *    - If there are more chains to process, initializes the next chain
 *    - Otherwise, completes the step function
 */
export const handler = metricScope((metrics) => async (event: StepFunctionState | EventBridgeEvent<string, void>): Promise<StepFunctionState | void> => {
  metrics.setNamespace('Uniswap')
  metrics.setDimensions({ Service: 'UniswapXServiceCron' })
  
  const log: Logger = bunyan.createLogger({
    name: 'DynamoReaperCron',
    serializers: bunyan.stdSerializers,
    level: 'info',
  })
  
  const repo = DutchOrdersRepository.create(new DynamoDB.DocumentClient())
  const providers = new Map<ChainId, ethers.providers.StaticJsonRpcProvider>()
  for (const chainIdKey of Object.keys(OLDEST_BLOCK_BY_CHAIN)) {
    const chainId = Number(chainIdKey) as keyof typeof OLDEST_BLOCK_BY_CHAIN
    const rpcURL = process.env[`RPC_${chainId}`]
    if (!rpcURL) {
      throw new Error(`RPC_${chainId} not set`)
    }
    const provider = new ethers.providers.StaticJsonRpcProvider({
      url: rpcURL,
      headers: RPC_HEADERS
    }, chainId)
    providers.set(chainId, provider)
  }

  // Initialize if this is the first run (is EventBridgeEvent)
  if ('time' in event) {
    const firstChainId = Number(Object.keys(OLDEST_BLOCK_BY_CHAIN)[0])
    const provider = providers.get(firstChainId)
    if (!provider) {
      throw new Error(`No provider found for chainId ${firstChainId}`)
    }
    const currentBlock = await provider.getBlockNumber()
    log.info(`Initializing GS Reaper for chainId ${firstChainId} with current block ${currentBlock} and earliest block ${OLDEST_BLOCK_BY_CHAIN[firstChainId as keyof typeof OLDEST_BLOCK_BY_CHAIN]}`)
    return {
      chainId: firstChainId,
      currentBlock,
      // TODO: After first run, use 1 day ago as earliest block
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[firstChainId as keyof typeof OLDEST_BLOCK_BY_CHAIN],
      orderUpdates: {},
      orderHashes: [],
      stage: 'GET_OPEN_ORDERS'
    }
  }

  const state = event as StepFunctionState
  const provider = providers.get(state.chainId)

  switch (state.stage) {
    case 'GET_OPEN_ORDERS': {
      log.info(`GET_OPEN_ORDERS for chainId ${state.chainId}`)
      const orderHashes = await getOpenOrderHashes(repo, state.chainId, MAX_ORDERS_PER_CHAIN)
      return {
        ...state,
        orderHashes,
        stage: 'PROCESS_BLOCKS'
      }
    }

    case 'PROCESS_BLOCKS': {
      if (!provider) {
        throw new Error(`No provider found for chainId ${state.chainId}`)
      }
      // Process multiple block ranges before returning
      let currentBlock = state.currentBlock
      let orderUpdates = state.orderUpdates
      const orderHashSet = new Set(state.orderHashes)
      
      for (let i = 0; i < REAPER_RANGES_PER_RUN; i++) {
        const nextBlock = currentBlock - BLOCK_RANGE
        log.info(`PROCESS_BLOCKS for chainId ${state.chainId} blocks ${currentBlock} to ${nextBlock}`)
        const { updates, remainingHashes } = await processBlockRange(
          currentBlock,
          nextBlock,
          state.chainId,
          orderHashSet,
          repo,
          provider,
          orderUpdates,
          log,
          metrics
        )
        
        orderUpdates = updates
        state.orderHashes = Array.from(remainingHashes)
        currentBlock = nextBlock
        if (currentBlock <= state.earliestBlock) {
          return {
            ...state,
            currentBlock,
            orderUpdates,
            stage: 'CHECK_CANCELLED'
          }
        }
      }

      return {
        ...state,
        currentBlock,
        orderUpdates,
        stage: 'PROCESS_BLOCKS'
      }
    }

    case 'CHECK_CANCELLED': {
      log.info(`CHECK_CANCELLED for chainId ${state.chainId}`)
      if (!provider) {
        throw new Error(`No provider found for chainId ${state.chainId}`)
      }
      const orderUpdates = await checkCancelledOrders(
        state.orderHashes,
        state.orderUpdates,
        repo,
        provider,
        state.chainId,
        log
      )
      
      return {
        ...state,
        orderUpdates,
        stage: 'UPDATE_DB'
      }
    }

    case 'UPDATE_DB': {
      log.info(`UPDATE_DB for chainId ${state.chainId}`)
      await updateOrders(repo, state.orderUpdates, log, metrics)
      
      const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
      const currentChainIndex = chainIds.indexOf(state.chainId)
      
      // We're done
      if (currentChainIndex === chainIds.length - 1) {
        log.info(`Done`)
        return
      }

      const nextChainId = chainIds[currentChainIndex + 1]
      const nextProvider = providers.get(nextChainId)
      if (!nextProvider) {
        throw new Error(`No provider found for chainId ${nextChainId}`)
      }
      const currentBlock = await nextProvider.getBlockNumber()
      return {
        chainId: nextChainId,
        currentBlock,
        earliestBlock: OLDEST_BLOCK_BY_CHAIN[nextChainId as keyof typeof OLDEST_BLOCK_BY_CHAIN],
        orderUpdates: {},
        orderHashes: [],
        stage: 'GET_OPEN_ORDERS'
      }
    }
  }
})

async function processBlockRange(
  fromBlock: number,
  toBlock: number,
  chainId: number,
  orderHashSet: Set<string>,
  repo: BaseOrdersRepository<UniswapXOrderEntity>,
  provider: ethers.providers.StaticJsonRpcProvider,
  existingUpdates: Record<string, OrderUpdate>,
  log: Logger,
  metrics?: MetricsLogger
): Promise<{ updates: Record<string, OrderUpdate>, remainingHashes: Set<string> }> {
  const orderUpdates = { ...existingUpdates }
  
  for (const orderType of Object.keys(REACTOR_ADDRESS_MAPPING[chainId])) {
    const reactorAddress = REACTOR_ADDRESS_MAPPING[chainId][orderType as OrderType]
    if (!reactorAddress || reactorAddress === "0x0000000000000000000000000000000000000000") continue
    log.info(`Processing block range ${fromBlock} to ${toBlock} for chainId ${chainId} orderType ${orderType}`)
    
    const watcher = new UniswapXEventWatcher(provider, reactorAddress)
    let attempts = 0
    let recentErrors = 0

    while (attempts < REAPER_MAX_ATTEMPTS) {
      try {
        const fillEvents = await watcher.getFillEvents(toBlock, fromBlock)
        recentErrors = Math.max(0, recentErrors - 1)
        
        for (const e of fillEvents) {
          if (orderHashSet.has(e.orderHash)) {
            log.info(`Fill event found for order ${e.orderHash}`)
            try {
              const { order } = await getOrderByHash(repo, e.orderHash)
              const fillInfo = await watcher.getFillInfo(toBlock, fromBlock)
              const fillEvent = fillInfo.find((f) => f.orderHash === e.orderHash)
              
              if (fillEvent) {
                const orderFillInfo = await getOrderFillInfo(provider, fillEvent, order)
                orderUpdates[e.orderHash] = {
                  status: ORDER_STATUS.FILLED,
                  txHash: orderFillInfo.txHash,
                  fillBlock: orderFillInfo.fillBlock,
                  settledAmounts: orderFillInfo.settledAmounts,
                }
                orderHashSet.delete(e.orderHash)
              } else {
                orderUpdates[e.orderHash] = {
                  status: ORDER_STATUS.FILLED,
                }
              }
              orderHashSet.delete(e.orderHash)
            } catch (error) {
              log.error({ error }, `Failed to process fill event for order ${e.orderHash}`)
            }
          }
        }
        break
      } catch (error) {
        log.error({ error }, `Attempt ${attempts}/${REAPER_MAX_ATTEMPTS} failed to get fill events for blocks ${toBlock} to ${fromBlock}`)
        attempts++
        recentErrors++
        if (attempts === REAPER_MAX_ATTEMPTS) {
          log.error({ error }, `Failed to get fill events after ${attempts} attempts for blocks ${toBlock} to ${fromBlock}`)
          metrics?.putMetric(`GetFillEventsError`, 1, Unit.Count)
          // Return the updates and remaining hashes so we can continue processing
          return { updates: orderUpdates, remainingHashes: orderHashSet }
        }
      }
    }
  }
  
  return { updates: orderUpdates, remainingHashes: orderHashSet }
}

async function checkCancelledOrders(
  orderHashes: string[],
  existingUpdates: Record<string, OrderUpdate>,
  repo: BaseOrdersRepository<UniswapXOrderEntity>,
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number,
  log: Logger,
): Promise<Record<string, OrderUpdate>> {
  const orderUpdates = { ...existingUpdates }
  const quoter = new OrderValidator(provider, chainId)
  
  for (const orderHash of orderHashes) {
    if (!orderUpdates[orderHash]) {
      try {
        const { order, signature } = await getOrderByHash(repo, orderHash)
        const validation = await quoter.validate({
          order: order,
          signature: signature,
        })
        if (validation === OrderValidation.NonceUsed) {
          orderUpdates[orderHash] = {
            status: ORDER_STATUS.CANCELLED,
          }
        }
        if (validation === OrderValidation.Expired) {
          orderUpdates[orderHash] = {
            status: ORDER_STATUS.EXPIRED,
          }
        }
      } catch (error) {
        log.error({ error }, `Failed to get or validate order ${orderHash}`)
      }
    }
  }
  
  return orderUpdates
}

async function updateOrders(
  repo: BaseOrdersRepository<UniswapXOrderEntity>,
  orderUpdates: Record<string, OrderUpdate>,
  log: Logger,
  metrics?: MetricsLogger
): Promise<void> {
  log.info(`Updating ${Object.keys(orderUpdates).length} incorrect orders`)
  
  for (const [orderHash, orderUpdate] of Object.entries(orderUpdates)) {
    await repo.updateOrderStatus(
      orderHash,
      orderUpdate.status,
      orderUpdate.txHash,
      orderUpdate.fillBlock,
      orderUpdate.settledAmounts
    )

    metrics?.putMetric(`UpdateOrderStatus_${orderUpdate.status}`, 1, Unit.Count)
  }
  
  log.info(`Update complete`)
}

/**
 * Get hashes of all open orders from the database
 */
async function getOpenOrderHashes(
  repo: BaseOrdersRepository<UniswapXOrderEntity>, 
  chainId: ChainId, 
  maxOrders: number
): Promise<string[]> {
  let cursor: string | undefined = undefined
  let orderHashes: string[] = []
  
  do {
    const openOrders: QueryResult<UniswapXOrderEntity> = await repo.getOrders(
      DYNAMO_BATCH_WRITE_MAX,
      {
        orderStatus: ORDER_STATUS.OPEN,
        chainId: chainId,
      },
      cursor
    )
    cursor = openOrders.cursor
    orderHashes = orderHashes.concat(openOrders.orders.map(o => o.orderHash))
    
    if (orderHashes.length >= maxOrders) {
      orderHashes = orderHashes.slice(0, maxOrders)
      break
    }
  } while (cursor)

  return orderHashes
}

type OrderWithSignature = 
{
  order: UniswapXOrder,
  signature: string
}

async function getOrderByHash(repo: BaseOrdersRepository<UniswapXOrderEntity>, orderHash: string): Promise<OrderWithSignature> {
  const order = await repo.getByHash(orderHash)
  if (!order) {
    throw new Error(`Order ${orderHash} not found`)
  }
  return {
    order: parseOrder(order, order.chainId),
    signature: order.signature,
  }
}

async function getOrderFillInfo(
  provider: ethers.providers.StaticJsonRpcProvider,
  fillEvent: FillInfo,
  order: UniswapXOrder
): Promise<{ txHash: string; fillBlock: number; settledAmounts: SettledAmount[] }> {
  const [tx, block] = await Promise.all([
    provider.getTransaction(fillEvent.txHash),
    provider.getBlock(fillEvent.blockNumber),
  ])
  const settledAmounts = getSettledAmounts(
    fillEvent,
    {
      timestamp: block.timestamp,
      gasPrice: tx.gasPrice,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      maxFeePerGas: tx.maxFeePerGas,
    },
    order as DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
  )
  return {
    txHash: fillEvent.txHash,
    fillBlock: fillEvent.blockNumber,
    settledAmounts,
  }
}