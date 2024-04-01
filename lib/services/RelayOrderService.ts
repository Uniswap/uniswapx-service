import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType, OrderValidation, RelayOrderValidator as OnChainRelayOrderValidator } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, RelayOrderEntity } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { RelayOrder } from '../models/RelayOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { OffChainRelayOrderValidator } from '../util/OffChainRelayOrderValidator'

export class RelayOrderService {
  constructor(
    private readonly orderValidator: OffChainRelayOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainRelayOrderValidator>,
    private readonly repository: BaseOrdersRepository<RelayOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number
  ) {}

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
}
