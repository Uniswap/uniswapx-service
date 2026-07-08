import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  FillInfo,
  OrderType,
  OrderValidation,
  OrderValidator,
  UniswapXEventWatcher,
  CosignedHybridOrder,
} from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, RelayOrderEntity, SettledAmount, UniswapXOrderEntity } from '../../entities'
import { log } from '../../Logging'
import { CheckOrderStatusHandlerMetricNames, wrapWithTimerMetric } from '../../Metrics'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { AnalyticsServiceInterface } from '../../services/analytics-service'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { SfnStateInputOutput } from '../base'
import { FillEventLogger } from './fill-event-logger'
import { AVERAGE_BLOCK_TIME, getSettledAmounts, IS_TERMINAL_STATE, timestampToBlockNumber } from './util'
import { parseOrder } from '../OrderParser'
import { PRIORITY_ORDER_TARGET_BLOCK_BUFFER } from '../constants'
import { PermissionedTokenValidator } from '@uniswap/uniswapx-sdk'
import { Permit2Validator } from '../../util/Permit2Validator'

const FILL_CHECK_OVERLAP_BLOCK = 20
// Fixed slack added to the fill-search upper bound on top of double the
// order's estimated lifetime in blocks, absorbing block-cadence variance and
// the gap between order creation and the first poll.
const FILL_SEARCH_SLACK_BLOCKS = 500

// Type for legacy orders that have input at the info level
type LegacyUniswapXOrder = DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder

/**
 * The block at which the order's auction/decay starts, for order types that
 * encode it as a block number (Dutch V3, Hybrid, Priority). Returns undefined
 * for timestamp-based order types and for missing or non-positive values -- a
 * zero here is an absent field's default, not a real block, and anchoring a
 * search to block zero turns it into an unbounded getLogs.
 */
export function getAuctionStartBlock(order: UniswapXOrderEntity, chainId: number): number | undefined {
  let block: number | undefined
  switch (order.type) {
    case OrderType.Dutch_V3:
      block = order.cosignerData?.decayStartBlock
      break
    case OrderType.Hybrid:
      block = order.cosignerData?.auctionTargetBlock
      break
    case OrderType.Priority:
      block =
        order.cosignerData?.auctionTargetBlock !== undefined
          ? order.cosignerData.auctionTargetBlock - (PRIORITY_ORDER_TARGET_BLOCK_BUFFER[chainId as ChainId] ?? 0)
          : undefined
      break
  }
  return block !== undefined && block > 0 ? block : undefined
}
   
export type CheckOrderStatusRequest = {
  chainId: number
  orderHash: string
  startingBlockNumber: number
  orderStatus: ORDER_STATUS
  getFillLogAttempts: number
  retryCount: number
  provider: ethers.providers.StaticJsonRpcProvider
  orderWatcher: UniswapXEventWatcher
  orderQuoter: OrderValidator
  quoteId: string //only used for logging
  orderType: OrderType
}

export type ExtraUpdateInfo = {
  orderStatus: ORDER_STATUS
  txHash?: string
  fillBlock?: number
  settledAmounts?: SettledAmount[]
  getFillLogAttempts?: number
}

export class CheckOrderStatusService {
  constructor(
    private dbInterface: BaseOrdersRepository<UniswapXOrderEntity>,
    private fillEventBlockLookback: (chainId: ChainId) => number,
    private fillEventLogger: FillEventLogger,
    private checkOrderStatusUtils: CheckOrderStatusUtils
  ) {}

  public async handleRequest({
    chainId,
    quoteId,
    orderHash,
    getFillLogAttempts,
    startingBlockNumber,
    retryCount,
    provider,
    orderQuoter,
    orderWatcher,
    orderStatus,
  }: CheckOrderStatusRequest): Promise<SfnStateInputOutput> {
    const order: UniswapXOrderEntity = checkDefined(
      await wrapWithTimerMetric<UniswapXOrderEntity | undefined>(
        this.dbInterface.getByHash(orderHash),
        CheckOrderStatusHandlerMetricNames.GetFromDynamoTime
      ),
      `cannot find order by hash when updating order status, hash: ${orderHash}`
    )

    const parsedOrder = parseOrder(order, chainId)
    // We only check for nonce used and expired for permissioned tokens
    // since the order quoter can't move input tokens
    // For v4 orders like Hybrid, input is at a different level. Get input token safely.
    const inputToken = parsedOrder instanceof CosignedHybridOrder 
      ? parsedOrder.info.input.token 
      : (parsedOrder as LegacyUniswapXOrder).info.input.token
    const isPermissionedToken = PermissionedTokenValidator.isPermissionedToken(inputToken, chainId)
    const validationPromise = isPermissionedToken
      ? new Permit2Validator(provider, chainId).validate(parsedOrder)
      : orderQuoter.validate({
        order: parsedOrder,
        signature: order.signature,
      })

    let validation: OrderValidation
    try {
      validation = await wrapWithTimerMetric(
        validationPromise,
        CheckOrderStatusHandlerMetricNames.GetValidationTime
      )
    } catch (error) {
      log.error('error during order validation', { 
        error, 
        orderHash, 
        chainId,
        isPermissionedToken,
      })
      throw error
    }

    let curBlockNumber: number
    try {
      curBlockNumber = await wrapWithTimerMetric(
        provider.getBlockNumber(),
        CheckOrderStatusHandlerMetricNames.GetBlockNumberTime
      )
    } catch (error) {
      log.error('error getting current block number', { 
        error, 
        orderHash, 
        chainId 
      })
      throw error
    }

    const fromBlock = !startingBlockNumber ? curBlockNumber - this.fillEventBlockLookback(chainId) : startingBlockNumber

    const commonUpdateInfo = {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber: fromBlock,
      chainId,
      lastStatus: orderStatus,
      validation,
      // Echoed into the SFN state so the handler can stop respawning
      // executions for orders long past their deadline.
      deadline: order.deadline,
    }

    let extraUpdateInfo = undefined

    // if validation is NonceUsed or Expired it might be filled or unfilled
    // so check for a fillEvent
    // if no fill event, process in the unfilled path
    if (validation === OrderValidation.NonceUsed || validation === OrderValidation.Expired) {
      // Anchor the lower bound of the fill search to the order's decay/auction
      // start when we know it exactly. Fills can settle at or just before that
      // block (open and exclusive fills don't have to wait for decay), so a
      // rolling lookback window anchored at the first poll can sit entirely
      // after the fill -- the fill is then never found and the used nonce gets
      // misread as a cancellation.
      const fillSearchFromBlock = this.getFillSearchFromBlock(order, chainId, fromBlock)
      const fillSearchToBlock = this.getFillSearchToBlock(order, chainId, fillSearchFromBlock, curBlockNumber)

      let fillEvent: FillInfo | undefined
      try {
        fillEvent = await this.getFillEventForOrder(orderHash, fillSearchFromBlock, fillSearchToBlock, orderWatcher)
      } catch (e) {
        // Could not read fill events (e.g. an RPC getLogs range/rate limit).
        // A used nonce is equally consistent with a fill, so we must NOT fall
        // through to the unfilled path and finalize CANCELLED/EXPIRED on
        // incomplete information. Rethrow instead: the state machine's Retry
        // re-polls the transient case, and if the failure persists its Catch
        // fails the execution -- feeding the ExecutionsFailed alarm -- with the
        // order left non-terminal for the reaper to resolve. Swallowing the
        // error here would turn a visible failure into an invisible one.
        log.error('error fetching fill events', {
          error: e,
          orderHash,
          chainId,
        })
        metrics.putMetric(`OrderSfn-FillLookupFailed`, 1)
        metrics.putMetric(`OrderSfn-FillLookupFailed-chain-${chainId}`, 1)
        throw e
      }

      if (fillEvent) {
        try {
          const [tx, block] = await Promise.all([
            provider.getTransaction(fillEvent.txHash),
            provider.getBlock(fillEvent.blockNumber),
          ])

          let fillTimeBlocks: number | undefined = undefined;
          const fillBlock = block.number;
          const auctionStartBlock = getAuctionStartBlock(order, chainId);
          switch (order.type) {
            case OrderType.Dutch: // Approximation
              if (order.decayStartTime) {
                fillTimeBlocks = fillBlock - timestampToBlockNumber(block, order.decayStartTime, chainId);
              }
              break;
            case OrderType.Dutch_V2: // Approximation
              fillTimeBlocks = fillBlock - timestampToBlockNumber(block, order.cosignerData.decayStartTime, chainId);
              break;
            case OrderType.Dutch_V3: // Exact
            case OrderType.Priority: // Approximation
            case OrderType.Hybrid: // Exact
              if (auctionStartBlock !== undefined) {
                fillTimeBlocks = fillBlock - auctionStartBlock;
              }
              break;
          }

          const settledAmounts = getSettledAmounts(
            fillEvent,
            {
              timestamp: block.timestamp,
              gasPrice: tx.gasPrice,
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
              maxFeePerGas: tx.maxFeePerGas,
            },
            parsedOrder as DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
          )

          await this.fillEventLogger.processFillEvent({
            fillEvent,
            quoteId,
            chainId,
            startingBlockNumber,
            order,
            settledAmounts,
            tx,
            block,
            fillTimeBlocks,
            timestamp: block.timestamp,
          })

          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: fillEvent.txHash,
            fillBlock: fillEvent.blockNumber,
            settledAmounts,
          }
        } catch (e) {
          log.error('error processing fill event', { error: e })
          extraUpdateInfo = {
            orderStatus: ORDER_STATUS.FILLED,
            txHash: '',
            fillBlock: -1,
            settledAmounts: [],
          }
        }
      }
    }

    //not filled
    if (!extraUpdateInfo) {
      extraUpdateInfo = this.checkOrderStatusUtils.getUnfilledStatusFromValidation({
        validation,
        getFillLogAttempts,
        lastStatus: orderStatus,
      })
    }

    const updateObject = {
      ...commonUpdateInfo,
      ...extraUpdateInfo,
    }

    return this.checkOrderStatusUtils.updateStatusAndReturn(updateObject)
  }

  /**
   * Lower bound (inclusive) for the fill-event search. When the order's
   * decay/auction start block is known exactly (Dutch V3, Hybrid, Priority) we
   * anchor to it so fills that land at or just before it are always in range,
   * regardless of when polling first ran. For timestamp-based order types
   * (Dutch, Dutch V2) we keep the rolling lookback window. Always at least
   * FILL_CHECK_OVERLAP_BLOCK below the rolling window so coverage never shrinks.
   */
  private getFillSearchFromBlock(
    order: UniswapXOrderEntity,
    chainId: number,
    rollingFromBlock: number
  ): number {
    const anchorBlock = getAuctionStartBlock(order, chainId)

    const rollingLowerBound = Math.max(0, rollingFromBlock - FILL_CHECK_OVERLAP_BLOCK)
    if (anchorBlock === undefined) {
      return rollingLowerBound
    }
    return Math.max(0, Math.min(rollingLowerBound, anchorBlock - FILL_CHECK_OVERLAP_BLOCK))
  }

  /**
   * Upper bound (inclusive) for the fill-event search. A fill can only land
   * between order creation and the order's deadline (the reactor enforces the
   * deadline onchain), so the search never needs to extend more than the
   * order's lifetime past its lower bound. Without this cap, a lower bound
   * that is anchored to the auction start -- and survives execution restarts --
   * makes the getLogs span grow with tracking age until RPCs reject it. The
   * estimate is deliberately generous (double the average-cadence lifetime
   * plus fixed slack) so block-time variance cannot truncate real coverage;
   * young orders are unaffected because the current head is smaller.
   */
  private getFillSearchToBlock(
    order: UniswapXOrderEntity,
    chainId: number,
    searchFromBlock: number,
    curBlockNumber: number
  ): number {
    if (!order.createdAt || !order.deadline || order.deadline <= order.createdAt) {
      return curBlockNumber
    }
    const lifespanBlocks = Math.ceil((order.deadline - order.createdAt) / AVERAGE_BLOCK_TIME(chainId))
    return Math.min(curBlockNumber, searchFromBlock + 2 * lifespanBlocks + FILL_SEARCH_SLACK_BLOCKS)
  }

  private async getFillEventForOrder(
    orderHash: string,
    fromBlock: number,
    toBlock: number,
    orderWatcher: UniswapXEventWatcher
  ): Promise<FillInfo | undefined> {
    const fillEvents = await wrapWithTimerMetric(
      orderWatcher.getFillInfo(fromBlock, toBlock),
      CheckOrderStatusHandlerMetricNames.GetFillEventsTime
    )

    const fillEvent = fillEvents.find((e) => e.orderHash === orderHash)

    return fillEvent
  }
}

export class CheckOrderStatusUtils {
  constructor(
    private readonly serviceOrderType: OrderType,
    private readonly analyticsService: AnalyticsServiceInterface,
    private readonly repository: BaseOrdersRepository<UniswapXOrderEntity> | BaseOrdersRepository<RelayOrderEntity>,
    private calculateRetryWaitSeconds: (chainId: ChainId, retryCount: number) => number
  ) {}

  public async updateStatusAndReturn(params: {
    orderHash: string
    retryCount: number
    startingBlockNumber: number
    chainId: number
    lastStatus: ORDER_STATUS
    orderStatus: ORDER_STATUS
    validation: OrderValidation
    quoteId: string
    txHash?: string
    fillBlock?: number
    settledAmounts?: SettledAmount[]
    getFillLogAttempts?: number
    runIndex?: number
    deadline?: number
  }): Promise<SfnStateInputOutput> {
    const {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber,
      chainId,
      lastStatus,
      orderStatus,
      txHash,
      fillBlock,
      settledAmounts,
      getFillLogAttempts,
      validation,
      runIndex,
      deadline,
    } = params

    // Avoid updating the order if the status is unchanged.
    // This also avoids unnecessarily triggering downstream events from dynamodb changes.
    if (orderStatus !== lastStatus) {
      if (orderStatus === ORDER_STATUS.INSUFFICIENT_FUNDS) {
        this.analyticsService.logInsufficientFunds(orderHash, this.serviceOrderType, quoteId)
      } else if (orderStatus === ORDER_STATUS.CANCELLED) {
        this.analyticsService.logCancelled(orderHash, this.serviceOrderType, quoteId)
      }
      log.info('calling updateOrderStatus', { orderHash, orderStatus, lastStatus })
      await this.repository.updateOrderStatus(orderHash, orderStatus, txHash, fillBlock, settledAmounts)
      if (IS_TERMINAL_STATE(orderStatus)) {
        metrics.putMetric(`OrderSfn-${orderStatus}`, 1)
        metrics.putMetric(`OrderSfn-${orderStatus}-chain-${chainId}`, 1)
        log.info('order in terminal state', {
          terminalOrderInfo: {
            orderStatus,
            orderHash,
            quoteId: quoteId,
            getFillLogAttempts,
            startingBlockNumber,
            chainId: chainId,
            settledAmounts: settledAmounts
              ?.map((s) => JSON.stringify(s))
              .join(',')
              .toString(),
            retryCount,
            validation,
          },
        })
      }
    }

    return {
      orderHash: orderHash,
      orderStatus: orderStatus,
      retryCount: (retryCount || 0) + 1,
      quoteId: quoteId,
      retryWaitSeconds: this.calculateRetryWaitSeconds(chainId, retryCount),
      startingBlockNumber: startingBlockNumber,
      chainId: chainId,
      runIndex: runIndex || 0,
      ...(settledAmounts && { settledAmounts }),
      ...(txHash && { txHash }),
      ...(fillBlock && { fillBlock }),
      ...(getFillLogAttempts && { getFillLogAttempts }),
      ...(deadline && { deadline }),
    }
  }

  public getUnfilledStatusFromValidation({
    validation,
    getFillLogAttempts,
    lastStatus,
  }: {
    validation: OrderValidation
    getFillLogAttempts: number
    lastStatus: ORDER_STATUS
  }): ExtraUpdateInfo {
    switch (validation) {
      case OrderValidation.Expired: {
        return {
          orderStatus: getFillLogAttempts === 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.EXPIRED,
          getFillLogAttempts: getFillLogAttempts + 1,
        }
      }
      case OrderValidation.InsufficientFunds:
        return {
          orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        }
      case OrderValidation.InvalidSignature:
      case OrderValidation.InvalidOrderFields:
        return { orderStatus: ORDER_STATUS.ERROR }
      case OrderValidation.UnknownError:
        // Ambiguous/transient validator result (e.g. an unrecognized revert or
        // a flaky RPC): this poll learned nothing about the order, so keep the
        // status it already has. Don't finalize terminal ERROR (the order may
        // be valid or already filled), and don't write OPEN either -- that
        // would ping-pong with statuses like INSUFFICIENT_FUNDS across polls,
        // emitting a DB write and a downstream webhook on every flip. Polling
        // continues either way, bounded by the tracking abandon gate.
        return { orderStatus: lastStatus }
      case OrderValidation.NonceUsed: {
        return {
          orderStatus: getFillLogAttempts === 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.CANCELLED,
          getFillLogAttempts: getFillLogAttempts + 1,
        }
      }
      default:
        return {
          orderStatus: ORDER_STATUS.OPEN,
        }
    }
  }
}
