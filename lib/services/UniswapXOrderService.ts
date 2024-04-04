import { Logger } from '@aws-lambda-powertools/logger'
import {
  CosignedV2DutchOrder,
  DutchOrder,
  OrderType,
  OrderValidation,
  OrderValidator as OnChainOrderValidator,
} from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV1Order } from '../models/DutchV1Order'
import { DutchV2Order } from '../models/DutchV2Order'
import { LimitOrder } from '../models/LimitOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { OffChainUniswapXOrderValidator } from '../util/OffChainUniswapXOrderValidator'
import { formatOrderEntity } from '../util/order'
import { AnalyticsServiceInterface } from './analytics-service'

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainUniswapXOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>,
    private readonly repository: BaseOrdersRepository<UniswapXOrderEntity>,
    private readonly limitRepository: BaseOrdersRepository<UniswapXOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private analyticsService: AnalyticsServiceInterface
  ) {}

  async createOrder(order: DutchV1Order | LimitOrder | DutchV2Order): Promise<string> {
    let orderEntity
    if (order instanceof DutchV1Order || order instanceof LimitOrder) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = formatOrderEntity(order.inner, order.signature, OrderType.Dutch, ORDER_STATUS.OPEN, order.quoteId)
    } else if (order instanceof DutchV2Order) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = order.toEntity(ORDER_STATUS.OPEN)
    } else {
      throw new Error('unsupported OrderType')
    }

    const canPlaceNewOrder = await this.userCanPlaceNewOrder(orderEntity.offerer)
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(orderEntity)

    const realOrderType = order.orderType
    await this.logOrderCreatedEvent(orderEntity, realOrderType)

    // TODO: cleanup with generic order model
    const quoteId = 'quoteId' in order ? order.quoteId : undefined
    await this.startOrderTracker(orderEntity.orderHash, order.chainId, quoteId, realOrderType)

    return orderEntity.orderHash
  }

  private async validateOrder(
    order: DutchOrder | CosignedV2DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
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

  private async persistOrder(order: UniswapXOrderEntity): Promise<void> {
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

  private async logOrderCreatedEvent(order: UniswapXOrderEntity, orderType: OrderType) {
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

  public async getDutchV2AndDutchOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetDutchV2OrderResponse | UniswapXOrderEntity>> {
    const queryResults = await this.repository.getOrders(limit, params, cursor)
    const resultList: (GetDutchV2OrderResponse | UniswapXOrderEntity)[] = []
    for (let i = 0; i < queryResults.orders.length; i++) {
      const order = queryResults.orders[i]
      if (order.type === OrderType.Dutch_V2) {
        const dutchV2Order = DutchV2Order.fromEntity(order)
        resultList.push(dutchV2Order.toGetResponse())
      } else {
        resultList.push(order)
      }
    }
    return { orders: resultList, cursor: queryResults.cursor }
  }

  public async getDutchOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<UniswapXOrderEntity>> {
    const queryResults = await this.repository.getOrders(limit, params, cursor)
    queryResults.orders = queryResults.orders.filter((order) => order.type === OrderType.Dutch)
    return queryResults
  }

  public async getLimitOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<UniswapXOrderEntity>> {
    const queryResults = await this.limitRepository.getOrders(limit, params, cursor)
    return queryResults
  }
}
