import {
  CosignedV2DutchOrder,
  DutchOrder,
  FillInfo,
  OrderType,
  OrderValidation,
  OrderValidator,
  RelayOrder,
  RelayOrderValidator,
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
import {
  calculateDutchRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  getRelaySettledAmounts,
  getSettledAmounts,
  IS_TERMINAL_STATE,
} from './util'

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

type ExtraUpdateInfo = {
  orderStatus: ORDER_STATUS
  txHash?: string
  settledAmounts?: SettledAmount[]
  getFillLogAttempts?: number
}

export class CheckOrderStatusService {
  private readonly fillEventLogger
  constructor(
    private dbInterface: BaseOrdersRepository<UniswapXOrderEntity> | BaseOrdersRepository<RelayOrderEntity>,
    private serviceOrderType: OrderType,
    private analyticsService: AnalyticsServiceInterface,
    private fillEventBlockLookback: (chainId: ChainId) => number = FILL_EVENT_LOOKBACK_BLOCKS_ON,
    private calculateRetryWaitSeconds = calculateDutchRetryWaitSeconds
  ) {
    this.fillEventLogger = new FillEventLogger(fillEventBlockLookback)
  }

  public async handleRequest({
    chainId,
    quoteId,
    orderHash,
    getFillLogAttempts,
    startingBlockNumber,
    retryCount,
    provider,
    orderWatcher,
    orderStatus,
    orderType,
  }: CheckOrderStatusRequest): Promise<SfnStateInputOutput> {
    const order: UniswapXOrderEntity | RelayOrderEntity = checkDefined(
      await wrapWithTimerMetric<UniswapXOrderEntity | RelayOrderEntity | undefined>(
        this.dbInterface.getByHash(orderHash),
        CheckOrderStatusHandlerMetricNames.GetFromDynamoTime
      ),
      'cannot find order by hash when updating order status'
    )

    let parsedOrder: DutchOrder | CosignedV2DutchOrder | RelayOrder
    switch (orderType) {
      case OrderType.Dutch:
      case OrderType.Limit:
        parsedOrder = DutchOrder.parse(order.encodedOrder, chainId)
        break
      case OrderType.Dutch_V2:
        parsedOrder = CosignedV2DutchOrder.parse(order.encodedOrder, chainId)
        break
      case OrderType.Relay:
        parsedOrder = RelayOrder.parse(order.encodedOrder, chainId)
        break
      default:
        throw new Error(`Unsupported OrderType ${orderType}, No Parser Configured`)
    }

    let validation: OrderValidation
    if (orderType === OrderType.Relay) {
      const orderQuoter = new RelayOrderValidator(provider, chainId)
      validation = await wrapWithTimerMetric(
        orderQuoter.validate({
          order: parsedOrder as RelayOrder,
          signature: order.signature,
        }),
        CheckOrderStatusHandlerMetricNames.GetValidationTime
      )
    } else if (orderType === OrderType.Dutch || orderType === OrderType.Dutch_V2 || orderType === OrderType.Limit) {
      const orderQuoter = new OrderValidator(provider, chainId)
      validation = await wrapWithTimerMetric(
        orderQuoter.validate({
          order: parsedOrder as DutchOrder | CosignedV2DutchOrder,
          signature: order.signature,
        }),
        CheckOrderStatusHandlerMetricNames.GetValidationTime
      )
    } else {
      throw new Error(`Unsupported OrderType ${orderType}, No Validator Configured`)
    }

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
    // check for fill
    if (validation === OrderValidation.NonceUsed || validation === OrderValidation.Expired) {
      const fillEvent = await this.getFillEventForOrder(orderHash, fromBlock, curBlockNumber, orderWatcher)
      if (fillEvent) {
        const [tx, block] = await Promise.all([
          provider.getTransaction(fillEvent.txHash),
          provider.getBlock(fillEvent.blockNumber),
        ])
        const settledAmounts =
          orderType === OrderType.Relay
            ? getRelaySettledAmounts(fillEvent, parsedOrder as RelayOrder)
            : getSettledAmounts(fillEvent, block.timestamp, parsedOrder as DutchOrder | CosignedV2DutchOrder)

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
      extraUpdateInfo = await this.getUnfilledStatusFromValidation({
        validation,
        getFillLogAttempts,
      })
    }

    const updateObject = {
      ...commonUpdateInfo,
      ...extraUpdateInfo,
    }

    return this.updateStatusAndReturn(updateObject)
  }

  private async getUnfilledStatusFromValidation({
    validation,
    getFillLogAttempts,
  }: {
    validation: OrderValidation
    getFillLogAttempts: number
  }): Promise<ExtraUpdateInfo> {
    let extraUpdateInfo: ExtraUpdateInfo

    switch (validation) {
      case OrderValidation.Expired: {
        extraUpdateInfo = {
          orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.EXPIRED,
          getFillLogAttempts: getFillLogAttempts + 1,
        }
        break
      }
      case OrderValidation.InsufficientFunds:
        extraUpdateInfo = {
          orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
        }
        break
      case OrderValidation.InvalidSignature:
      case OrderValidation.InvalidOrderFields:
      case OrderValidation.UnknownError:
        extraUpdateInfo = { orderStatus: ORDER_STATUS.ERROR }
        break
      case OrderValidation.NonceUsed: {
        extraUpdateInfo = {
          orderStatus: getFillLogAttempts == 0 ? ORDER_STATUS.OPEN : ORDER_STATUS.CANCELLED,
          getFillLogAttempts: getFillLogAttempts + 1,
        }
        break
      }
      default:
        extraUpdateInfo = {
          orderStatus: ORDER_STATUS.OPEN,
        }
        break
    }
    return extraUpdateInfo
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

  private async updateStatusAndReturn(params: {
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
      await this.dbInterface.updateOrderStatus(orderHash, orderStatus, txHash, settledAmounts)
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
}
