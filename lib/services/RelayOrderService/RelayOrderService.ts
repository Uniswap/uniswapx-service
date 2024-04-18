import { Logger } from '@aws-lambda-powertools/logger'
import {
  FillInfo,
  OrderType,
  OrderValidation,
  RelayEventWatcher,
  RelayOrder as SDKRelayOrder,
  RelayOrderValidator as OnChainRelayOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, RelayOrderEntity } from '../../entities'
import { InvalidTokenInAddress } from '../../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../../errors/TooManyOpenOrdersError'
import { FillEventLogger } from '../../handlers/check-order-status/fill-event-logger'
import { CheckOrderStatusUtils, ExtraUpdateInfo } from '../../handlers/check-order-status/service'
import {
  calculateDutchRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  getRelaySettledAmounts,
} from '../../handlers/check-order-status/util'
import { EventWatcherMap } from '../../handlers/EventWatcherMap'
import { GetOrdersQueryParams } from '../../handlers/get-orders/schema'
import { GetOrdersResponse } from '../../handlers/get-orders/schema/GetOrdersResponse'
import { GetRelayOrderResponse } from '../../handlers/get-orders/schema/GetRelayOrderResponse'
import { OnChainValidatorMap } from '../../handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../../handlers/shared/sfn'
import { CheckOrderStatusHandlerMetricNames, wrapWithTimerMetric } from '../../Metrics'
import { RelayOrder } from '../../models/RelayOrder'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { OffChainRelayOrderValidator } from '../../util/OffChainRelayOrderValidator'
import { AnalyticsService } from '../analytics-service'

export class RelayOrderService {
  private readonly checkOrderStatusUtils: CheckOrderStatusUtils
  constructor(
    private readonly orderValidator: OffChainRelayOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainRelayOrderValidator>,
    private readonly relayOrderWatcherMap: EventWatcherMap<RelayEventWatcher>,
    private readonly repository: BaseOrdersRepository<RelayOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private readonly fillEventLogger: FillEventLogger
  ) {
    this.checkOrderStatusUtils = new CheckOrderStatusUtils(
      OrderType.Relay,
      AnalyticsService.create(),
      repository,
      calculateDutchRetryWaitSeconds
    )
  }

  async createOrder(order: RelayOrder): Promise<string> {
    await this.validateOrder(order, order.signature, order.chainId)

    const orderEntity = order.toEntity(ORDER_STATUS.OPEN)

    const canPlaceNewOrder = await this.userCanPlaceNewOrder(orderEntity.offerer)
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(orderEntity)
    await this.startOrderTracker(orderEntity.orderHash, order.chainId, '', order.orderType)

    return orderEntity.orderHash
  }

  private async validateOrder(order: RelayOrder, signature: string, chainId: number): Promise<void> {
    const offChainValidationResult = this.orderValidator.validate(order.inner)
    if (!offChainValidationResult.valid) {
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }

    const onChainValidator = this.onChainValidatorMap.get(chainId)
    const onChainValidationResult = await onChainValidator.validate({ order: order.inner, signature: signature })
    if (onChainValidationResult !== OrderValidation.OK) {
      const failureReason = OrderValidation[onChainValidationResult]
      throw new OrderValidationFailedError(`Onchain validation failed: ${failureReason}`)
    }

    if (order.inner.info.input.token === ethers.constants.AddressZero) {
      throw new InvalidTokenInAddress()
    }
  }

  private async userCanPlaceNewOrder(offerer: string): Promise<boolean> {
    try {
      const orderCount = await this.repository.countOrdersByOffererAndStatus(offerer, ORDER_STATUS.OPEN)

      if (orderCount > this.getMaxOpenOrders(offerer)) {
        this.logger.info(`${offerer} has too many open orders`, {
          orderCount,
        })
        return false
      }
      return true
    } catch (e) {
      this.logger.error(`failed to fetch open order count for ${offerer}`, {
        e,
      })
      throw e
    }
  }

  private async persistOrder(order: RelayOrderEntity): Promise<void> {
    try {
      await this.repository.putOrderAndUpdateNonceTransaction(order)
      this.logger.info(`Successfully inserted Order ${order.orderHash} into DB`)
    } catch (e: unknown) {
      this.logger.error(`Failed to insert order ${order.orderHash} into DB`, {
        e,
      })
      throw e
    }
  }

  private async startOrderTracker(
    orderHash: string,
    chainId: number,
    quoteId: string | undefined,
    orderType: OrderType
  ) {
    const stateMachineArn = checkDefined(process.env[`STATE_MACHINE_ARN_${chainId}`])
    await kickoffOrderTrackingSfn(
      {
        orderHash: orderHash,
        chainId: chainId,
        orderStatus: ORDER_STATUS.OPEN,
        quoteId: quoteId ?? '',
        orderType,
        stateMachineArn,
      },
      stateMachineArn
    )
  }

  public async getOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetRelayOrderResponse>> {
    const queryResults = await this.repository.getOrders(limit, params, cursor)
    const resultList: GetRelayOrderResponse[] = []
    for (let i = 0; i < queryResults.orders.length; i++) {
      const relayOrder = RelayOrder.fromEntity(queryResults.orders[i])
      resultList.push(relayOrder.toGetResponse())
    }
    return { orders: resultList, cursor: queryResults.cursor }
  }

  public async checkOrderStatus(
    orderHash: string,
    quoteId: string,
    startingBlockNumber: number,
    orderStatus: ORDER_STATUS,
    getFillLogAttempts: number,
    retryCount: number,
    provider: ethers.providers.StaticJsonRpcProvider
  ) {
    const order: RelayOrderEntity = await checkDefined(
      await wrapWithTimerMetric<RelayOrderEntity | undefined>(
        this.repository.getByHash(orderHash),
        CheckOrderStatusHandlerMetricNames.GetFromDynamoTime
      ),
      'cannot find order by hash when updating order status'
    )

    const parsedOrder = SDKRelayOrder.parse(order.encodedOrder, order.chainId)

    const onChainValidator = this.onChainValidatorMap.get(order.chainId)
    const validation = await wrapWithTimerMetric(
      onChainValidator.validate({
        order: parsedOrder,
        signature: order.signature,
      }),
      CheckOrderStatusHandlerMetricNames.GetValidationTime
    )

    const curBlockNumber = await wrapWithTimerMetric(
      provider.getBlockNumber(),
      CheckOrderStatusHandlerMetricNames.GetBlockNumberTime
    )

    const fromBlock = !startingBlockNumber
      ? curBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(order.chainId)
      : startingBlockNumber

    const commonUpdateInfo = {
      orderHash,
      quoteId,
      retryCount,
      startingBlockNumber: fromBlock,
      chainId: order.chainId,
      lastStatus: orderStatus,
      validation,
    }

    let extraUpdateInfo = undefined

    // check for fill
    if (validation === OrderValidation.NonceUsed || validation === OrderValidation.Expired) {
      extraUpdateInfo = await this.checkFillEvents({
        orderHash,
        order,
        provider,
        blocks: {
          curBlockNumber,
          fromBlock,
          startingBlockNumber,
        },
      })
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

  public async checkFillEvents({
    orderHash,
    order,
    provider,
    blocks,
  }: {
    orderHash: string
    order: RelayOrderEntity
    provider: ethers.providers.StaticJsonRpcProvider
    blocks: {
      fromBlock: number
      curBlockNumber: number
      startingBlockNumber: number
    }
  }): Promise<ExtraUpdateInfo | null> {
    const parsedOrder = RelayOrder.fromEntity(order)
    const orderWatcher = this.relayOrderWatcherMap.get(order.chainId)

    const fillEvents: FillInfo[] = await wrapWithTimerMetric(
      orderWatcher.getFillInfo(blocks.fromBlock, blocks.curBlockNumber),
      CheckOrderStatusHandlerMetricNames.GetFillEventsTime
    )
    const fillEvent = fillEvents.find((e) => e.orderHash === orderHash)

    if (!fillEvent) {
      return null
    }

    const [tx, block] = await Promise.all([
      provider.getTransaction(fillEvent.txHash),
      provider.getBlock(fillEvent.blockNumber),
    ])

    const settledAmounts = getRelaySettledAmounts(fillEvent, parsedOrder.inner)

    await this.fillEventLogger.processFillEvent({
      fillEvent,
      chainId: order.chainId,
      startingBlockNumber: blocks.startingBlockNumber,
      order,
      settledAmounts,
      tx,
      timestamp: block.timestamp,
    })

    return {
      orderStatus: ORDER_STATUS.FILLED,
      txHash: fillEvent.txHash,
      settledAmounts,
    }
  }
}
