import { EventBridgeEvent } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, QueryResult } from '../repositories/base'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import { BLOCK_RANGE, REAPER_MAX_ATTEMPTS, DYNAMO_BATCH_WRITE_MAX, OLDEST_BLOCK_BY_CHAIN, REAPER_RANGES_PER_RUN } from '../util/constants'
import { ethers } from 'ethers'
import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder, OrderType, OrderValidation, OrderValidator, REACTOR_ADDRESS_MAPPING, UniswapXEventWatcher, UniswapXOrder } from '@uniswap/uniswapx-sdk'
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
  parsedOrders: Record<string, { order: UniswapXOrder; signature: string; deadline: number }>
  stage: 'INIT' | 'PROCESS_BLOCKS' | 'CHECK_CANCELLED' | 'UPDATE_DB'
}

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
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId)
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
    return {
      chainId: firstChainId,
      currentBlock,
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[firstChainId as keyof typeof OLDEST_BLOCK_BY_CHAIN],
      orderUpdates: {},
      parsedOrders: {},
      stage: 'INIT'
    }
  }

  const state = event as StepFunctionState
  const provider = providers.get(state.chainId)
  if (!provider) {
    throw new Error(`No provider found for chainId ${state.chainId}`)
  }

  switch (state.stage) {
    case 'INIT': {
      const parsedOrdersMap = await getParsedOrders(repo, state.chainId)
      return {
        ...state,
        parsedOrders: Object.fromEntries(parsedOrdersMap),
        stage: 'PROCESS_BLOCKS'
      }
    }

    case 'PROCESS_BLOCKS': {
      // Process multiple block ranges before returning
      for (let i = 0; i < REAPER_RANGES_PER_RUN; i++) {
        const nextBlock = state.currentBlock - BLOCK_RANGE
        const orderUpdates = await processBlockRange(
          state.currentBlock,
          nextBlock,
          state.chainId,
          state.parsedOrders,
          provider,
          state.orderUpdates,
          log,
          metrics
        )

        state.currentBlock = nextBlock
        state.orderUpdates = orderUpdates

        if (nextBlock <= state.earliestBlock) {
          return {
            ...state,
            stage: 'CHECK_CANCELLED'
          }
        }
      }

      return {
        ...state,
        stage: 'PROCESS_BLOCKS'
      }
    }

    case 'CHECK_CANCELLED': {
      const orderUpdates = await checkCancelledOrders(
        state.parsedOrders,
        state.orderUpdates,
        provider,
        state.chainId
      )
      
      return {
        ...state,
        orderUpdates,
        stage: 'UPDATE_DB'
      }
    }

    case 'UPDATE_DB': {
      await updateOrders(repo, state.orderUpdates, log, metrics)
      
      const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
      const currentChainIndex = chainIds.indexOf(state.chainId)
      
      // We're done
      if (currentChainIndex === chainIds.length - 1) {
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
        parsedOrders: {},
        stage: 'INIT'
      }
    }
  }
})

async function processBlockRange(
  fromBlock: number,
  toBlock: number,
  chainId: number,
  parsedOrders: Record<string, { order: UniswapXOrder; signature: string; deadline: number }>,
  provider: ethers.providers.StaticJsonRpcProvider,
  existingUpdates: Record<string, OrderUpdate>,
  log: Logger,
  metrics?: MetricsLogger
): Promise<Record<string, OrderUpdate>> {
  const orderUpdates = { ...existingUpdates }
  const parsedOrdersMap = new Map(Object.entries(parsedOrders))
  
  for (const orderType of Object.keys(REACTOR_ADDRESS_MAPPING[chainId])) {
    const reactorAddress = REACTOR_ADDRESS_MAPPING[chainId][orderType as OrderType]
    if (!reactorAddress) continue
    
    const watcher = new UniswapXEventWatcher(provider, reactorAddress)
    let attempts = 0
    let recentErrors = 0

    while (attempts < REAPER_MAX_ATTEMPTS) {
      try {
        log.info(`Getting fill events for blocks ${toBlock} to ${fromBlock}`)
        const fillEvents = await watcher.getFillEvents(toBlock, fromBlock)
        recentErrors = Math.max(0, recentErrors - 1)
        
        await Promise.all(fillEvents.map(async (e) => {
          if (parsedOrdersMap.has(e.orderHash)) {
            log.info(`Fill event found for order ${e.orderHash}`)
            const fillInfo = await watcher.getFillInfo(toBlock, fromBlock)
            const fillEvent = fillInfo.find((f) => f.orderHash === e.orderHash)
            if (fillEvent) {
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
                parsedOrdersMap.get(e.orderHash)?.order as DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
              )
              orderUpdates[e.orderHash] = {
                status: ORDER_STATUS.FILLED,
                txHash: fillEvent.txHash,
                fillBlock: fillEvent.blockNumber,
                settledAmounts: settledAmounts,
              }
            } else {
              orderUpdates[e.orderHash] = {
                status: ORDER_STATUS.FILLED,
              }
            }
          }
        }))
        break
      } catch (error) {
        attempts++
        recentErrors++
        log.error({ error }, `Failed to get fill events for blocks ${toBlock} to ${fromBlock}`)
        if (attempts === REAPER_MAX_ATTEMPTS) {
          log.error({ error }, `Failed to get fill events after ${attempts} attempts for blocks ${toBlock} to ${fromBlock}`)
          metrics?.putMetric(`GetFillEventsError`, 1, Unit.Count)
          break
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * recentErrors))
      }
    }
  }

  return orderUpdates
}

async function checkCancelledOrders(
  parsedOrders: Record<string, { order: UniswapXOrder; signature: string; deadline: number }>,
  existingUpdates: Record<string, OrderUpdate>,
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number
): Promise<Record<string, OrderUpdate>> {
  const orderUpdates = { ...existingUpdates }
  const quoter = new OrderValidator(provider, chainId)
  
  for (const [orderHash, orderData] of Object.entries(parsedOrders)) {
    if (!orderUpdates[orderHash]) {
      const validation = await quoter.validate({
        order: orderData.order,
        signature: orderData.signature,
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
 * Get all open orders from the database and parse them
 * @param repo - The orders repository
 * @param chainId - The chain ID
 * @returns A map of order hashes to their parsed order data
 */
async function getParsedOrders(repo: BaseOrdersRepository<UniswapXOrderEntity>, chainId: ChainId) {

    // Collect all open orders
    let cursor: string | undefined = undefined
    let allOrders: UniswapXOrderEntity[] = []
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
      allOrders = allOrders.concat(openOrders.orders)

    } while (cursor)
    const parsedOrders = new Map<string, {order: UniswapXOrder, signature: string, deadline: number}>()
    allOrders.forEach((o) => parsedOrders.set(o.orderHash, {order: parseOrder(o, chainId), signature: o.signature, deadline: o.deadline}))
    return parsedOrders
}