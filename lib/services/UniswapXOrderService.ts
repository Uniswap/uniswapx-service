import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { DutchOrder, OrderType, OrderValidation, OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { default as Logger } from 'bunyan'
import { OrderEntity, ORDER_STATUS } from '../entities'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { formatOrderEntity } from '../util/order'
import { OrderValidator as OffChainOrderValidator } from '../util/order-validator'
import { currentTimestampInSeconds } from '../util/time'

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainOrderValidator,
    private readonly onChainValidator: OnChainOrderValidator,
    private readonly repository: BaseOrdersRepository,
    private readonly logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number
  ) {}

  async createOrder(
    order: DutchOrder,
    signature: string,
    quoteId: string | undefined,
    orderType: OrderType
  ): Promise<string> {
    await this.validateOrder(order, signature)
    const orderEntity = formatOrderEntity(order, signature, OrderType.Dutch, ORDER_STATUS.OPEN, quoteId)

    const canPlaceNewOrder = await this.userCanPlaceNewOrder(orderEntity.offerer)
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(orderEntity)
    await this.logOrderCreatedEvent(orderEntity, orderType)
    await this.startOrderTracker(orderEntity.orderHash, order.chainId, quoteId, orderType)

    return orderEntity.orderHash
  }

  private async validateOrder(order: DutchOrder, signature: string): Promise<void> {
    const offChainValidationResult = this.orderValidator.validate(order)
    if (!offChainValidationResult.valid) {
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }

    const onChainValidationResult = await this.onChainValidator.validate({ order: order, signature: signature })
    if (onChainValidationResult !== OrderValidation.OK) {
      const failureReason = OrderValidation[onChainValidationResult]
      throw new OrderValidationFailedError(`Onchain validation failed: ${failureReason}`)
    }
  }

  private async userCanPlaceNewOrder(offerer: string): Promise<boolean> {
    try {
      const orderCount = await this.repository.countOrdersByOffererAndStatus(offerer, ORDER_STATUS.OPEN)

      if (orderCount > this.getMaxOpenOrders(offerer)) {
        this.logger.info(orderCount, `${offerer} has too many open orders`)
        return false
      }
      return true
    } catch (e) {
      this.logger.error(e, `failed to fetch open order count for ${offerer}`)
      throw e
    }
  }

  private async persistOrder(order: OrderEntity): Promise<void> {
    try {
      await this.repository.putOrderAndUpdateNonceTransaction(order)
      this.logger.info(`Successfully inserted Order ${order.orderHash} into DB`)
    } catch (e: unknown) {
      this.logger.error(e, `Failed to insert order ${order.orderHash} into DB`)
      throw e
    }
  }

  private async logOrderCreatedEvent(order: OrderEntity, orderType: OrderType) {
    // Log used for cw dashboard and redshift metrics, do not modify
    // skip fee output logging
    const userOutput = order.outputs.reduce((prev, cur) => (prev && prev.startAmount > cur.startAmount ? prev : cur))
    this.logger.info({
      eventType: 'OrderPosted',
      body: {
        quoteId: order.quoteId,
        createdAt: currentTimestampInSeconds(),
        orderHash: order.orderHash,
        startTime: order.decayStartTime,
        endTime: order.decayEndTime,
        deadline: order.deadline,
        chainId: order.chainId,
        inputStartAmount: order.input?.startAmount,
        inputEndAmount: order.input?.endAmount,
        tokenIn: order.input?.token,
        outputStartAmount: userOutput.startAmount,
        outputEndAmount: userOutput.endAmount,
        tokenOut: userOutput.token,
        filler: getAddress(order.filler ?? AddressZero),
        orderType: orderType,
      },
    })
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
