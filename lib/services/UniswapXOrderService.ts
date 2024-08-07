import { Logger } from '@aws-lambda-powertools/logger'
import { KMSClient } from '@aws-sdk/client-kms'
import { KmsSigner } from '@uniswap/signer'
import {
  CosignedPriorityOrder,
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
import { GetPriorityOrderResponse } from '../handlers/get-orders/schema/GetPriorityOrderResponse'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { ProviderMap } from '../handlers/shared'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV1Order } from '../models/DutchV1Order'
import { DutchV2Order } from '../models/DutchV2Order'
import { LimitOrder } from '../models/LimitOrder'
import { PriorityOrder } from '../models/PriorityOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { OffChainUniswapXOrderValidator } from '../util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT, formatOrderEntity } from '../util/order'
import { AnalyticsServiceInterface } from './analytics-service'
const MAX_QUERY_RETRY = 10

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainUniswapXOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>,
    private readonly repository: BaseOrdersRepository<UniswapXOrderEntity>,
    private readonly limitRepository: BaseOrdersRepository<UniswapXOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private analyticsService: AnalyticsServiceInterface,
    private readonly providerMap: ProviderMap
  ) {}

  async createOrder(order: DutchV1Order | LimitOrder | DutchV2Order | PriorityOrder): Promise<string> {
    let orderEntity
    if (order instanceof DutchV1Order || order instanceof LimitOrder) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = formatOrderEntity(order.inner, order.signature, OrderType.Dutch, ORDER_STATUS.OPEN, order.quoteId)
    } else if (order instanceof DutchV2Order) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = order.toEntity(ORDER_STATUS.OPEN)
    } else if (order instanceof PriorityOrder) {
      // following https://github.com/Uniswap/uniswapx-parameterization-api/pull/358
      // recreate KmsSigner every request
      const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
      const awsRegion = checkDefined(process.env.REGION, 'REGION is not defined')
      const cosigner = new KmsSigner(new KMSClient({ region: awsRegion }), kmsKeyId)
      const provider = checkDefined(this.providerMap.get(order.chainId))

      const cosignedOrder = await order.reparameterizeAndCosign(provider, cosigner)

      await this.validateOrder(cosignedOrder.inner, cosignedOrder.signature, cosignedOrder.chainId)
      orderEntity = cosignedOrder.toEntity(ORDER_STATUS.OPEN)
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
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder,
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
    const queryResults = await this.repository.getOrdersFilteredByType(
      limit,
      params,
      [OrderType.Dutch, DUTCH_LIMIT, OrderType.Dutch_V2],
      cursor
    )
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

  public async getDutchV2Orders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetDutchV2OrderResponse>> {
    let queryResults = await this.repository.getOrdersFilteredByType(limit, params, [OrderType.Dutch_V2], cursor)
    const dutchV2QueryResults = [...queryResults.orders]

    let retryCount = 0
    while (dutchV2QueryResults.length < limit && queryResults.cursor && retryCount < MAX_QUERY_RETRY) {
      queryResults = await this.repository.getOrdersFilteredByType(
        limit,
        params,
        [OrderType.Dutch_V2],
        queryResults.cursor
      )
      dutchV2QueryResults.push(...queryResults.orders)
      retryCount++
    }

    const dutchV2OrderResponses: GetDutchV2OrderResponse[] = []
    for (let i = 0; i < dutchV2QueryResults.length; i++) {
      const order = dutchV2QueryResults[i]
      const dutchV2Order = DutchV2Order.fromEntity(order)
      dutchV2OrderResponses.push(dutchV2Order.toGetResponse())
    }

    return { orders: dutchV2OrderResponses, cursor: queryResults.cursor }
  }

  public async getDutchOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<UniswapXOrderEntity>> {
    let queryResults = await this.repository.getOrdersFilteredByType(
      limit,
      params,
      [OrderType.Dutch, DUTCH_LIMIT],
      cursor
    )

    const dutchQueryResults = [...queryResults.orders]

    let retryCount = 0
    while (dutchQueryResults.length < limit && queryResults.cursor && retryCount < MAX_QUERY_RETRY) {
      queryResults = await this.repository.getOrdersFilteredByType(
        limit,
        params,
        [OrderType.Dutch, DUTCH_LIMIT],
        queryResults.cursor
      )
      dutchQueryResults.push(...queryResults.orders)
      retryCount++
    }

    return { orders: dutchQueryResults, cursor: queryResults.cursor }
  }

  public async getPriorityOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetPriorityOrderResponse>> {
    let queryResults = await this.repository.getOrdersFilteredByType(limit, params, [OrderType.Priority], cursor)
    const priorityQueryResults = [...queryResults.orders]

    let retryCount = 0
    while (priorityQueryResults.length < limit && queryResults.cursor && retryCount < MAX_QUERY_RETRY) {
      queryResults = await this.repository.getOrdersFilteredByType(
        limit,
        params,
        [OrderType.Priority],
        queryResults.cursor
      )
      priorityQueryResults.push(...queryResults.orders)
      retryCount++
    }

    const priorityOrderResponses: GetPriorityOrderResponse[] = []
    for (let i = 0; i < priorityQueryResults.length; i++) {
      const order = priorityQueryResults[i]
      const priorityOrder = PriorityOrder.fromEntity(order)
      priorityOrderResponses.push(priorityOrder.toGetResponse())
    }

    return { orders: priorityOrderResponses, cursor: queryResults.cursor }
  }

  public async getLimitOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<UniswapXOrderEntity>> {
    // TODO: DAT-313: Fix order type for Limit Orders
    const queryResults = await this.limitRepository.getOrdersFilteredByType(limit, params, [OrderType.Dutch], cursor)
    return queryResults
  }
}
