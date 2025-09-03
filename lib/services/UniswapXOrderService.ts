import { Logger } from '@aws-lambda-powertools/logger'
import { KMSClient } from '@aws-sdk/client-kms'
import { KmsSigner } from '@uniswap/signer'
import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  OrderType,
  OrderValidation,
  OrderValidator as OnChainOrderValidator,
  PermissionedTokenValidator,
} from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetDutchV3OrderResponse } from '../handlers/get-orders/schema/GetDutchV3OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { GetPriorityOrderResponse } from '../handlers/get-orders/schema/GetPriorityOrderResponse'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { ProviderMap } from '../handlers/shared'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV1Order } from '../models/DutchV1Order'
import { DutchV2Order } from '../models/DutchV2Order'
import { DutchV3Order } from '../models/DutchV3Order'
import { LimitOrder } from '../models/LimitOrder'
import { PriorityOrder } from '../models/PriorityOrder'
import { checkDefined } from '../preconditions/preconditions'
import { BaseOrdersRepository } from '../repositories/base'
import { QuoteMetadata, QuoteMetadataRepository } from '../repositories/quote-metadata-repository'
import { OffChainUniswapXOrderValidator } from '../util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT, formatOrderEntity } from '../util/order'
import { AnalyticsServiceInterface } from './analytics-service'
import { sendImmediateExclusiveFillerNotification } from '../handlers/order-notification/handler'
import { ExclusiveFillerWebhookOrder } from '../handlers/order-notification/types'
import { WebhookProvider } from '../providers/base'
import { hasExclusiveFiller } from '../util/address'

const MAX_QUERY_RETRY = 10

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainUniswapXOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>,
    private readonly repository: BaseOrdersRepository<UniswapXOrderEntity>,
    private readonly limitRepository: BaseOrdersRepository<UniswapXOrderEntity>,
    private readonly quoteMetadataRepository: QuoteMetadataRepository,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private analyticsService: AnalyticsServiceInterface,
    private readonly providerMap: ProviderMap,
    private readonly webhookProvider?: WebhookProvider
  ) {}

  async createOrder(order: DutchV1Order | LimitOrder | DutchV2Order | PriorityOrder | DutchV3Order): Promise<string> {
    let orderEntity: UniswapXOrderEntity
    if (order instanceof DutchV1Order || order instanceof LimitOrder) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = formatOrderEntity(order.inner, order.signature, OrderType.Dutch, ORDER_STATUS.OPEN, order.quoteId)
    } else if (order instanceof DutchV2Order || order instanceof DutchV3Order) {
      const [quoteMetadata] = await Promise.all([
        order.quoteId ? this.fetchQuoteMetadata(order.quoteId) : undefined,
        this.validateOrder(order.inner, order.signature, order.chainId),
      ])
      orderEntity = order.toEntity(ORDER_STATUS.OPEN, quoteMetadata)
    } else if (order instanceof PriorityOrder) {
      // following https://github.com/Uniswap/uniswapx-parameterization-api/pull/358
      // recreate KmsSigner every request
      const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
      const awsRegion = checkDefined(process.env.REGION, 'REGION is not defined')
      const cosigner = new KmsSigner(new KMSClient({ region: awsRegion }), kmsKeyId)
      const provider = checkDefined(
        this.providerMap.get(order.chainId),
        `provider not found for chainId: ${order.chainId}`
      )

      const cosignedOrder = await order.reparameterizeAndCosign(provider, cosigner)
      this.logger.info('cosigned priority order', { order: cosignedOrder })
      const [quoteMetadata] = await Promise.all([
        order.quoteId ? this.fetchQuoteMetadata(order.quoteId) : undefined,
        this.validateOrder(cosignedOrder.inner, cosignedOrder.signature, cosignedOrder.chainId),
      ])
      orderEntity = cosignedOrder.toEntity(ORDER_STATUS.OPEN, quoteMetadata)
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

    // Send immediate notification to exclusive filler if present
    if (this.webhookProvider && hasExclusiveFiller(orderEntity.filler)) {
      // Create properly typed webhook order data
      const exclusiveFillerOrder: ExclusiveFillerWebhookOrder = {
        orderHash: orderEntity.orderHash,
        createdAt: orderEntity.createdAt ?? Date.now(),
        signature: orderEntity.signature,
        offerer: orderEntity.offerer,
        orderStatus: orderEntity.orderStatus,
        encodedOrder: orderEntity.encodedOrder,
        chainId: orderEntity.chainId,
        quoteId: orderEntity.quoteId,
        filler: orderEntity.filler,
        orderType: realOrderType,
      }
      
      // Don't await to minimize latency-add to order posting flow
      sendImmediateExclusiveFillerNotification(
        exclusiveFillerOrder,
        realOrderType,
        this.webhookProvider,
        this.logger
      ).catch((error) => {
        this.logger.warn(
          { 
            orderHash: orderEntity.orderHash, 
            error: error.message || error,
            message: 'Immediate webhook notification failed, will rely on DynamoDB stream'
          }
        )
      })
    }

    // TODO: cleanup with generic order model
    const quoteId = 'quoteId' in order ? order.quoteId : undefined
    await this.startOrderTracker(orderEntity.orderHash, order.chainId, quoteId, realOrderType)

    return orderEntity.orderHash
  }

  private async validateOrder(
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
    const offChainValidationResult = this.orderValidator.validate(order)
    if (!offChainValidationResult.valid) {
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }

    if (PermissionedTokenValidator.isPermissionedToken(order.info.input.token, chainId)) {
      const provider = this.providerMap.get(chainId)
      if (!provider) {
        throw new OrderValidationFailedError(`Provider not found for chainId: ${chainId}`)
      }
      // Permissioned tokens shouldn't work with priority orders
      // TODO: excluded v3 orders because harder to handle trade type etc
      if (order instanceof PriorityOrder || order instanceof DutchV3Order) {
        throw new OrderValidationFailedError("Permissioned tokens shouldn't work with priority/v3 dutch orders")
      }
      const permissionedOrder = order as DutchOrder | CosignedV2DutchOrder
      const exclusiveFiller =
        permissionedOrder instanceof DutchOrder
          ? permissionedOrder.info.exclusiveFiller
          : permissionedOrder.info.cosignerData.exclusiveFiller
      const preTransferCheckResult = await PermissionedTokenValidator.preTransferCheck(
        this.providerMap.get(chainId)!,
        order.info.input.token,
        order.info.swapper,
        exclusiveFiller,
        this.isExactInput(permissionedOrder)
          ? permissionedOrder.info.input.startAmount.toString()
          : permissionedOrder.info.input.endAmount.toString() // exact_out 'decay' upwards
      )
      if (!preTransferCheckResult) {
        throw new OrderValidationFailedError(`Permissioned Token Pre-transfer check failed`)
      }
    } else {
      const onChainValidator = this.onChainValidatorMap.get(chainId)
      const onChainValidationResult = await onChainValidator.validate({ order: order, signature: signature })
      // Still considered valid
      if (order instanceof CosignedPriorityOrder && onChainValidationResult == OrderValidation.OrderNotFillableYet)
        return

      if (onChainValidationResult !== OrderValidation.OK) {
        const failureReason = OrderValidation[onChainValidationResult]
        throw new OrderValidationFailedError(`Onchain validation failed: ${failureReason}`)
      }
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
    const stateMachineArn = checkDefined(
      process.env[`STATE_MACHINE_ARN_${chainId}`],
      `STATE_MACHINE_ARN_${chainId} is undefined`
    )
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
        const dutchV2Order = DutchV2Order.fromEntity(order, this.logger)
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
    cursor: string | undefined,
    executeAddress: string | undefined
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
      const dutchV2Order = DutchV2Order.fromEntity(order, this.logger, executeAddress)
      dutchV2OrderResponses.push(dutchV2Order.toGetResponse())
    }

    return { orders: dutchV2OrderResponses, cursor: queryResults.cursor }
  }

  public async getDutchV3Orders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined,
    executeAddress: string | undefined
  ): Promise<GetOrdersResponse<GetDutchV3OrderResponse>> {
    let queryResults = await this.repository.getOrdersFilteredByType(limit, params, [OrderType.Dutch_V3], cursor)
    const dutchV3QueryResults = [...queryResults.orders]

    let retryCount = 0
    while (dutchV3QueryResults.length < limit && queryResults.cursor && retryCount < MAX_QUERY_RETRY) {
      queryResults = await this.repository.getOrdersFilteredByType(
        limit,
        params,
        [OrderType.Dutch_V3],
        queryResults.cursor
      )
      dutchV3QueryResults.push(...queryResults.orders)
      retryCount++
    }

    const dutchV3OrderResponses: GetDutchV3OrderResponse[] = []
    for (let i = 0; i < dutchV3QueryResults.length; i++) {
      const order = dutchV3QueryResults[i]
      const dutchV3Order = DutchV3Order.fromEntity(order, this.logger, executeAddress)
      dutchV3OrderResponses.push(dutchV3Order.toGetResponse())
    }

    return { orders: dutchV3OrderResponses, cursor: queryResults.cursor }
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
    cursor: string | undefined,
    executeAddress: string | undefined
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
      const priorityOrder = PriorityOrder.fromEntity(order, this.logger, executeAddress)
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

  private async fetchQuoteMetadata(quoteId: string): Promise<QuoteMetadata | undefined> {
    const quoteMetadata = await this.quoteMetadataRepository.getByQuoteId(quoteId)
    if (!quoteMetadata) {
      this.logger.warn({ quoteId, message: 'No quote metadata found for order' })
    }
    return quoteMetadata
  }

  private isExactInput(order: DutchOrder | CosignedV2DutchOrder): boolean {
    return order.info.input.startAmount.eq(order.info.input.endAmount)
  }
}
