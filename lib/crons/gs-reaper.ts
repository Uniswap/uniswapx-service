import { EventBridgeEvent, ScheduledHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { default as bunyan, default as Logger } from 'bunyan'
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../entities'
import { BaseOrdersRepository, QueryResult } from '../repositories/base'
import { DutchOrdersRepository } from '../repositories/dutch-orders-repository'
import { BLOCK_RANGE, CRON_MAX_ATTEMPTS, DYNAMO_BATCH_WRITE_MAX, OLDEST_BLOCK_BY_CHAIN } from '../util/constants'
import { ethers } from 'ethers'
import { CosignedPriorityOrder, CosignedV2DutchOrder, CosignedV3DutchOrder, DutchOrder, OrderType, OrderValidation, OrderValidator, REACTOR_ADDRESS_MAPPING, UniswapXEventWatcher, UniswapXOrder } from '@uniswap/uniswapx-sdk'
import { parseOrder } from '../handlers/OrderParser'
import { getSettledAmounts } from '../handlers/check-order-status/util'
import { ChainId } from '../util/chain'

export const handler: ScheduledHandler = metricScope((metrics) => async (_event: EventBridgeEvent<string, void>) => {
  await main(metrics)
})

async function main(metrics: MetricsLogger) {
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
  await cleanupOrphanedOrders(repo, providers, log, metrics)
}

type OrderUpdate = {
  status: ORDER_STATUS,
  txHash?: string,
  fillBlock?: number,
  settledAmounts?: SettledAmount[]
}

export async function cleanupOrphanedOrders(
  repo: BaseOrdersRepository<UniswapXOrderEntity>,
  providers: Map<ChainId, ethers.providers.StaticJsonRpcProvider>,
  log: Logger,
  metrics?: MetricsLogger
): Promise<void> {
  
  for (const chainIdKey of Object.keys(OLDEST_BLOCK_BY_CHAIN)) {
    const chainId = Number(chainIdKey) as keyof typeof OLDEST_BLOCK_BY_CHAIN
    const provider = providers.get(chainId)
    if (!provider) {
      log.error(`No provider found for chainId ${chainId}`)
      continue
    }

    const parsedOrders = await getParsedOrders(repo, chainId)
    const orderUpdates = new Map<string, OrderUpdate>()

    // Look through events to find if any of the orders have been filled
    for (const orderType of Object.keys(REACTOR_ADDRESS_MAPPING[chainId])){
      const reactorAddress = REACTOR_ADDRESS_MAPPING[chainId][orderType as OrderType]
      if (!reactorAddress) continue
      const watcher = new UniswapXEventWatcher(provider, reactorAddress)
      let lastProcessedBlock = await provider.getBlockNumber()
      let recentErrors = 0
      const earliestBlock = OLDEST_BLOCK_BY_CHAIN[chainId]
      // TODO: Lookback 1.2 days
      // const msPerDay = 1000 * 60 * 60 * 24 * 1.2
      // const blocksPerDay = msPerDay / BLOCK_TIME_MS_BY_CHAIN[chainId]
      // const earliestBlock = lastProcessedBlock - blocksPerDay

      for (let i = lastProcessedBlock; i > earliestBlock; i -= BLOCK_RANGE) {
        let attempts = 0
        while (attempts < CRON_MAX_ATTEMPTS) {
          try {
            log.info(`Getting fill events for blocks ${i - BLOCK_RANGE} to ${i}`)
            const fillEvents = await watcher.getFillEvents(i - BLOCK_RANGE, i)
            recentErrors = Math.max(0, recentErrors - 1)
            await Promise.all(fillEvents.map(async (e) => {
              if (parsedOrders.has(e.orderHash)) {
                log.info(`Fill event found for order ${e.orderHash}`)
                // Only get fill info when we know there's a matching event in this
                // range due to additional RPC calls that are required for fill info
                const fillInfo = await watcher.getFillInfo(i - BLOCK_RANGE, i)
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
                    parsedOrders.get(e.orderHash)?.order as DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
                  )
                  orderUpdates.set(e.orderHash, {
                    status: ORDER_STATUS.FILLED,
                    txHash: fillEvent.txHash,
                    fillBlock: fillEvent.blockNumber,
                    settledAmounts: settledAmounts,
                  })
                }
                else {
                  orderUpdates.set(e.orderHash, {
                    status: ORDER_STATUS.FILLED,
                  })
                }
              }
            }))

            break // Success - exit the retry loop
          } catch (error) {
            attempts++
            recentErrors++
            console.log(`Failed to get fill events for blocks ${i - BLOCK_RANGE} to ${i}, error: ${error}`)
            log.error({ error }, `Failed to get fill events for blocks ${i - BLOCK_RANGE} to ${i}`)
            if (attempts === CRON_MAX_ATTEMPTS) {
              log.error({ error }, `Failed to get fill events after ${attempts} attempts for blocks ${i - BLOCK_RANGE} to ${i}`)
              metrics?.putMetric(`GetFillEventsError`, 1, Unit.Count)
              break // Skip this range and continue with the next one
            }
            // Wait time is determined by the number of recent errors
            await new Promise(resolve => setTimeout(resolve, 1000 * recentErrors))
          }
        }
      }
    }

    // Loop through unfilled orders and see if they were cancelled
    const quoter = new OrderValidator(provider, chainId)
      for (const orderHash of parsedOrders.keys()) {
        if (!orderUpdates.has(orderHash)) {
        const validation = await quoter.validate({
          order: parsedOrders.get(orderHash)!.order,
          signature: parsedOrders.get(orderHash)!.signature,
        })
        if (validation === OrderValidation.NonceUsed) {
          orderUpdates.set(orderHash, {
            status: ORDER_STATUS.CANCELLED,
          })
        }
      }
    }

    // See which unfilled orders have expired
    for (const orderHash of parsedOrders.keys()) {
      if (!orderUpdates.has(orderHash)) {
        const expired = parsedOrders.get(orderHash)!.deadline < Date.now() / 1000
        if (expired) {
            orderUpdates.set(orderHash, {
              status: ORDER_STATUS.EXPIRED,
            })
          }
      }
    }

    // Update the orders in the database
    log.info(`Updating ${orderUpdates.size} incorrect orders`)
    for (const [orderHash, orderUpdate] of orderUpdates) {
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
}

async function getParsedOrders(repo: BaseOrdersRepository<UniswapXOrderEntity>, chainId: ChainId) {

    // Collect all open orders
    let cursor: string | undefined = undefined
    let allOrders: UniswapXOrderEntity[] = []
    do {
      const openOrders: QueryResult<UniswapXOrderEntity> = await repo.getOrders(DYNAMO_BATCH_WRITE_MAX, {
        orderStatus: ORDER_STATUS.OPEN,
        chainId: chainId,
        cursor: cursor,
      })
      cursor = openOrders.cursor
      allOrders = allOrders.concat(openOrders.orders)

    } while (cursor)
    const parsedOrders = new Map<string, {order: UniswapXOrder, signature: string, deadline: number}>()
    allOrders.forEach((o) => parsedOrders.set(o.orderHash, {order: parseOrder(o, chainId), signature: o.signature, deadline: o.deadline}))
    return parsedOrders
}