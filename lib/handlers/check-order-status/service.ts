import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  DutchOrder,
  FillInfo,
  OrderType,
  OrderValidation,
  OrderValidator,
  UniswapXEventWatcher,
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
import { getSettledAmounts, IS_TERMINAL_STATE } from './util'

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
    orderType,
  }: CheckOrderStatusRequest): Promise<SfnStateInputOutput> {
    const order: UniswapXOrderEntity = checkDefined(
      await wrapWithTimerMetric<UniswapXOrderEntity | undefined>(
        this.dbInterface.getByHash(orderHash),
        CheckOrderStatusHandlerMetricNames.GetFromDynamoTime
      ),
      `cannot find order by hash when updating order status, hash: ${orderHash}`
    )

    let parsedOrder: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder
    switch (orderType) {
      case OrderType.Dutch:
      case OrderType.Limit:
        parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
        break
      case OrderType.Dutch_V2:
        parsedOrder = CosignedV2DutchOrder.parse(order.encodedOrder, chainId)
        break
      case OrderType.Priority:
        parsedOrder = CosignedPriorityOrder.parse(order.encodedOrder, chainId)
        break
      default:
        throw new Error(`Unsupported OrderType ${orderType}, No Parser Configured`)
    }

    const validation = await wrapWithTimerMetric(
      orderQuoter.validate({
        order: parsedOrder,
        signature: order.signature,
      }),
      CheckOrderStatusHandlerMetricNames.GetValidationTime
    )

    const curBlockNumber = await wrapWithTimerMetric(
      provider.getBlockNumber(),
      CheckOrderStatusHandlerMetricNames.GetBlockNumberTime
    )

    const fromBlock = !startingBlockNumber ? curBlockNumber - this.fillEventBlockLookback(chainId) : startingBlockNumber

    const commonUpdateInfo = {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber: fromBlock,
      chainId,
      lastStatus: orderStatus,
      validation,
    }

    let extraUpdateInfo = undefined

    // if validation is NonceUsed or Expired it might be filled or unfilled
    // so check for a fillEvent
    // if no fill event, process in the unfilled path
    if (validation === OrderValidation.NonceUsed || validation === OrderValidation.Expired) {
      const fillEvent = await this.getFillEventForOrder(orderHash, fromBlock, curBlockNumber, orderWatcher)
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
          parsedOrder as DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder
        )

        await this.fillEventLogger.processFillEvent({
          fillEvent,
          quoteId,
          chainId,
          startingBlockNumber,
          order,
          settledAmounts,
          tx,
          timestamp: block.timestamp,
        })

        extraUpdateInfo = {
          orderStatus: ORDER_STATUS.FILLED,
          txHash: fillEvent.txHash,
          settledAmounts,
        }
      }
    }

    //not filled
    if (!extraUpdateInfo) {
      extraUpdateInfo = this.checkOrderStatusUtils.getUnfilledStatusFromValidation({
        validation,
        getFillLogAttempts,
      })
    }

    const updateObject = {
      ...commonUpdateInfo,
      ...extraUpdateInfo,
    }

    return this.checkOrderStatusUtils.updateStatusAndReturn(updateObject)
  }

  private async getFillEventForOrder(
    orderHash: string,
    fromBlock: number,
    curBlockNumber: number,
    orderWatcher: UniswapXEventWatcher
  ): Promise<FillInfo | undefined> {
    const fillEvents = await wrapWithTimerMetric(
      orderWatcher.getFillInfo(fromBlock, curBlockNumber),
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
    settledAmounts?: SettledAmount[]
    getFillLogAttempts?: number
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
      settledAmounts,
      getFillLogAttempts,
      validation,
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
      await this.repository.updateOrderStatus(orderHash, orderStatus, txHash, settledAmounts)
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
      ...(settledAmounts && { settledAmounts }),
      ...(txHash && { txHash }),
      ...(getFillLogAttempts && { getFillLogAttempts }),
    }
  }

  public getUnfilledStatusFromValidation({
    validation,
    getFillLogAttempts,
  }: {
    validation: OrderValidation
    getFillLogAttempts: number
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
      case OrderValidation.UnknownError:
        return { orderStatus: ORDER_STATUS.ERROR }
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
