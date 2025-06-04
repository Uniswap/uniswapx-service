import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../../entities'
import { BaseOrdersRepository, QueryResult } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { BLOCK_RANGE, REAPER_MAX_ATTEMPTS, DYNAMO_BATCH_WRITE_MAX, OLDEST_BLOCK_BY_CHAIN, REAPER_RANGES_PER_RUN, RPC_HEADERS } from '../../util/constants'
import { ethers } from 'ethers'
import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder, FillInfo, OrderType, OrderValidation, OrderValidator, REACTOR_ADDRESS_MAPPING, UniswapXEventWatcher, UniswapXOrder } from '@uniswap/uniswapx-sdk'
import { parseOrder } from '../../handlers/OrderParser'
import { getSettledAmounts } from '../../handlers/check-order-status/util'
import { ChainId } from '../../util/chain'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'

type OrderUpdate = {
  status: ORDER_STATUS,
  txHash?: string,
  fillBlock?: number,
  settledAmounts?: SettledAmount[]
}

export enum ReaperStage {
  GET_OPEN_ORDERS = 'GET_OPEN_ORDERS',
  PROCESS_BLOCKS = 'PROCESS_BLOCKS',
  CHECK_CANCELLED = 'CHECK_CANCELLED',
  UPDATE_DB = 'UPDATE_DB'
}

type ChainState = {
  chainId: number
  currentBlock: number
  earliestBlock: number
  orderUpdates: Record<string, OrderUpdate>
  orderHashes: string[]
  stage: ReaperStage
}

// Step functions have a max payload size of 256KB
// Avg parsed order size is 2KB so 50 orders ensures we stay well under the limit
const MAX_ORDERS_PER_CHAIN = 50
const SLEEP_TIME_MS = 1000 // 1 second between iterations

/**
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
export class GSReaper {
  private log: Logger
  private repo: BaseOrdersRepository<UniswapXOrderEntity>
  private providers: Map<ChainId, ethers.providers.StaticJsonRpcProvider>

  constructor(repo: BaseOrdersRepository<UniswapXOrderEntity>) {
    this.log = bunyan.createLogger({
      name: 'GSReaper',
      serializers: bunyan.stdSerializers,
      level: 'info',
    })
    this.repo = repo
    this.providers = new Map<ChainId, ethers.providers.StaticJsonRpcProvider>()
    this.initializeProviders()
  }

  private initializeProviders() {
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
      this.providers.set(chainId, provider)
    }
  }

  protected async initializeChainState(chainId: ChainId): Promise<ChainState> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chainId ${chainId}`)
    }
    const currentBlock = await provider.getBlockNumber()
    this.log.info(`Initializing GS Reaper for chainId ${chainId} with current block ${currentBlock} and earliest block ${OLDEST_BLOCK_BY_CHAIN[chainId as keyof typeof OLDEST_BLOCK_BY_CHAIN]}`)
    return {
      chainId,
      currentBlock,
      earliestBlock: OLDEST_BLOCK_BY_CHAIN[chainId as keyof typeof OLDEST_BLOCK_BY_CHAIN],
      orderUpdates: {},
      orderHashes: [],
      stage: ReaperStage.GET_OPEN_ORDERS
    }
  }
  
  /**
   * Manages the state machine for the GS Reaper
   * @param state - The current chain state
   * @returns The next chain state or null if there are no more chains to process
   */
  protected async processChainState(state: ChainState): Promise<ChainState | null> {
    const provider = this.providers.get(state.chainId)
    if (!provider) {
      throw new Error(`No provider found for chainId ${state.chainId}`)
    }

    switch (state.stage) {
      case ReaperStage.GET_OPEN_ORDERS: {
        this.log.info(`GET_OPEN_ORDERS for chainId ${state.chainId}`)
        const orderHashes = await getOpenOrderHashes(this.repo, state.chainId, MAX_ORDERS_PER_CHAIN, this.log)
        return {
          ...state,
          orderHashes: orderHashes,
          stage: ReaperStage.PROCESS_BLOCKS
        }
      }

      case ReaperStage.PROCESS_BLOCKS: {
        let currentBlock = state.currentBlock
        let orderUpdates = state.orderUpdates
        const orderHashSet = new Set(state.orderHashes)
        
        for (let i = 0; i < REAPER_RANGES_PER_RUN; i++) {
          const nextBlock = currentBlock - BLOCK_RANGE
          this.log.info(`PROCESS_BLOCKS for chainId ${state.chainId} blocks ${currentBlock} to ${nextBlock}`)
          const { updates, remainingHashes } = await processBlockRange(
            currentBlock,
            nextBlock,
            state.chainId,
            orderHashSet,
            this.repo,
            provider,
            orderUpdates,
            this.log
          )
          
          orderUpdates = updates
          state.orderHashes = Array.from(remainingHashes)
          currentBlock = nextBlock
          if (currentBlock <= state.earliestBlock) {
            return {
              ...state,
              currentBlock,
              orderUpdates,
              stage: ReaperStage.CHECK_CANCELLED
            }
          }
        }

        return {
          ...state,
          currentBlock,
          orderUpdates,
          stage: ReaperStage.PROCESS_BLOCKS
        }
      }

      case ReaperStage.CHECK_CANCELLED: {
        this.log.info(`CHECK_CANCELLED for chainId ${state.chainId}`)
        const orderUpdates = await checkCancelledOrders(
          state.orderHashes,
          state.orderUpdates,
          this.repo,
          provider,
          state.chainId,
          this.log
        )
        
        return {
          ...state,
          orderUpdates,
          stage: ReaperStage.UPDATE_DB
        }
      }

      case ReaperStage.UPDATE_DB: {
        this.log.info(`UPDATE_DB for chainId ${state.chainId}`)
        await updateOrders(this.repo, state.orderUpdates, this.log)
        
        const chainIds = Object.keys(OLDEST_BLOCK_BY_CHAIN).map(Number)
        const currentChainIndex = chainIds.indexOf(state.chainId)
        
        // We're done with all chains
        if (currentChainIndex === chainIds.length - 1) {
          this.log.info(`Done with chain ${state.chainId}`)
          return null
        }

        const nextChainId = chainIds[currentChainIndex + 1]
        return this.initializeChainState(nextChainId)
      }
    }
  }

  public async start() {
    this.log.info('Starting GS Reaper service')
    
    // Initialize first chain
    const firstChainId = Number(Object.keys(OLDEST_BLOCK_BY_CHAIN)[0])
    let currentState: ChainState | null = await this.initializeChainState(firstChainId)
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // return once we've processed all chains
        if (!currentState) {
          return
        }

        currentState = await this.processChainState(currentState)
        
        await new Promise(resolve => setTimeout(resolve, SLEEP_TIME_MS))
      } catch (error) {
        this.log.error({ error }, 'Error in GS Reaper main loop')
        // Sleep longer on error
        await new Promise(resolve => setTimeout(resolve, SLEEP_TIME_MS * 5))
      }
    }
  }
}

async function processBlockRange(
  fromBlock: number,
  toBlock: number,
  chainId: number,
  orderHashSet: Set<string>,
  repo: BaseOrdersRepository<UniswapXOrderEntity>,
  provider: ethers.providers.StaticJsonRpcProvider,
  existingUpdates: Record<string, OrderUpdate>,
  log: Logger
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
          log.info(`Order ${orderHash} has been cancelled`)
          orderUpdates[orderHash] = {
            status: ORDER_STATUS.CANCELLED,
          }
        }
        if (validation === OrderValidation.Expired) {
          log.info(`Order ${orderHash} has expired`)
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
  log: Logger
): Promise<void> {
  log.info(`Updating ${Object.keys(orderUpdates).length} incorrect orders`)
  
  for (const [orderHash, orderUpdate] of Object.entries(orderUpdates)) {
    log.info(`Updating order ${orderHash} to ${orderUpdate.status}`)
    await repo.updateOrderStatus(
      orderHash,
      orderUpdate.status,
      orderUpdate.txHash,
      orderUpdate.fillBlock,
      orderUpdate.settledAmounts
    )
  }
  
  log.info(`Update complete`)
}

/**
 * Get hashes of all open orders from the database
 */
async function getOpenOrderHashes(
  repo: BaseOrdersRepository<UniswapXOrderEntity>, 
  chainId: ChainId, 
  maxOrders: number,
  log: Logger
): Promise<string[]> {
  let cursor: string | undefined = undefined
  let orderHashes: string[] = []
  const orderCountByType = new Map<string, number>()
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
    for (const order of openOrders.orders) {
      orderCountByType.set(order.type, (orderCountByType.get(order.type) ?? 0) + 1)
    }
    if (orderHashes.length >= maxOrders) {
      orderHashes = orderHashes.slice(0, maxOrders)
      break
    }
  } while (cursor)

  for (const [orderType, count] of orderCountByType) {
    log.info(`Found ${count} ${orderType} open orders for chainId ${chainId}`)
  }

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

async function startReapers() {
  const dutchReaper = new GSReaper(DutchOrdersRepository.create(new DynamoDB.DocumentClient()))
  const limitReaper = new GSReaper(LimitOrdersRepository.create(new DynamoDB.DocumentClient()))
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await dutchReaper.start().catch(error => {
      console.error('Fatal error in GS Reaper:', error)
      process.exit(1)
    })
    await limitReaper.start().catch(error => {
      console.error('Fatal error in GS Reaper:', error)
      process.exit(1)
    })
  }
}

// Start the service
if (require.main === module) {
  startReapers()
}