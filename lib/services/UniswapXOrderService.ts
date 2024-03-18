import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { DutchOrderEntity, ORDER_STATUS } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV1Order } from '../models/DutchV1Order'
import { LimitOrder } from '../models/LimitOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { OrderValidator as OffChainOrderValidator } from '../util/order-validator'
import { AnalyticsServiceInterface } from './analytics-service'

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap,
    private readonly repository: BaseOrdersRepository<DutchOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private orderType: OrderType,
    private analyticsService: AnalyticsServiceInterface
  ) {}

  async createOrder(order: DutchV1Order | LimitOrder): Promise<string> {
    await this.validateOrder(order)

    const canPlaceNewOrder = await this.userCanPlaceNewOrder(order.offerer)
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(order)

    this.analyticsService.logOrderPosted(order)
    await this.startOrderTracker(order.orderHash, order.chainId, order.quoteId, this.orderType)

    return order.orderHash
  }

  private async validateOrder(order: DutchV1Order | LimitOrder): Promise<void> {
    const offChainValidationResult = this.orderValidator.validate(order.inner)
    if (!offChainValidationResult.valid) {
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }

    const onChainValidator = this.onChainValidatorMap.get(order.chainId)
    const onChainValidationResult = await onChainValidator.validate({ order: order.inner, signature: order.signature })
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

  private async persistOrder(order: DutchV1Order | LimitOrder): Promise<void> {
    try {
      const orderEntity = order.toEntity()

      // Hack (andy.smith):  Until this bug is fixed in UniswapXOrderService, call everything a Dutch order.
      // Once the migration is ready, we can remove this line and the orderType will be properly set.
      // https://linear.app/uniswap/issue/DAT-313/fix-order-type-for-limit-orders-in-database
      orderEntity.type = OrderType.Dutch

      await this.repository.putOrderAndUpdateNonceTransaction(orderEntity)
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
}
