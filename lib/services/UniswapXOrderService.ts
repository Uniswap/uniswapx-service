import { Logger } from '@aws-lambda-powertools/logger'
import { DutchOrder, OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV1Order } from '../models/DutchV1Order'
import { LimitOrder } from '../models/LimitOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { formatOrderEntity } from '../util/order'
import { OrderValidator as OffChainOrderValidator } from '../util/order-validator'
import { AnalyticsServiceInterface } from './analytics-service'

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap,
    private readonly repository: BaseOrdersRepository,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private orderType: OrderType,
    private analyticsService: AnalyticsServiceInterface
  ) {}

  async createOrder(order: DutchV1Order | LimitOrder): Promise<string> {
    await this.validateOrder(order.inner, order.signature, order.chainId)
    const orderEntity = formatOrderEntity(
      order.inner,
      order.signature,
      OrderType.Dutch,
      ORDER_STATUS.OPEN,
      order.quoteId
    )

    const canPlaceNewOrder = await this.userCanPlaceNewOrder(orderEntity.offerer)
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(orderEntity)
    await this.logOrderCreatedEvent(orderEntity, this.orderType)
    await this.startOrderTracker(orderEntity.orderHash, order.chainId, order.quoteId, this.orderType)

    return orderEntity.orderHash
  }

  private async validateOrder(order: DutchOrder, signature: string, chainId: number): Promise<void> {
    const offChainValidationResult = this.orderValidator.validate(order)
    if (!offChainValidationResult.valid) {
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }

    const onChainValidator = this.onChainValidatorMap.get(chainId)
    const onChainValidationResult = await onChainValidator.validate({ order: order, signature: signature })
    if (onChainValidationResult !== OrderValidation.OK) {
      const failureReason = OrderValidation[onChainValidationResult]
      throw new OrderValidationFailedError(`Onchain validation failed: ${failureReason}`)
    }

    if (order.info.input.token === ethers.constants.AddressZero) {
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

  private async persistOrder(order: OrderEntity): Promise<void> {
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

  private async logOrderCreatedEvent(order: OrderEntity, orderType: OrderType) {
    // Log used for cw dashboard and redshift metrics, do not modify
    // skip fee output logging
    this.analyticsService.logOrderPosted(order, orderType)
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
}
