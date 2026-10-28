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
import { Unit } from 'aws-embedded-metrics'
import { BigNumber, ethers } from 'ethers'
import { toOrderEntity } from '../core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { GetOrdersQueryParams } from '../handlers/get-orders/schema'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { GetDutchV3OrderResponse } from '../handlers/get-orders/schema/GetDutchV3OrderResponse'
import { GetOrdersResponse } from '../handlers/get-orders/schema/GetOrdersResponse'
import { GetPriorityOrderResponse } from '../handlers/get-orders/schema/GetPriorityOrderResponse'
import { toPriorityResponse, toV2Response, toV3Response } from '../handlers/get-orders/toResponse'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { sendImmediateExclusiveFillerNotification } from '../handlers/order-notification/handler'
import { ExclusiveFillerWebhookOrder } from '../handlers/order-notification/types'
import { ProviderMap } from '../handlers/shared'
import { kickoffOrderTrackingSfn } from '../handlers/shared/sfn'
import { DutchV2Order } from '../models/DutchV2Order'
import { DutchV3Order } from '../models/DutchV3Order'
import { LimitOrder } from '../models/LimitOrder'
import { PriorityOrder } from '../models/PriorityOrder'
import { checkDefined } from '../preconditions/preconditions'
import { WebhookProvider } from '../providers/base'
import { BaseOrdersRepository, OrderStoreContext, QueryResult } from '../repositories/base'
import { hasExclusiveFiller } from '../util/address'
import { metrics } from '../util/metrics'
import { OffChainUniswapXOrderValidator } from '../util/OffChainUniswapXOrderValidator'
import { DUTCH_LIMIT } from '../util/order'
import { OrderSignatureValidator } from '../util/OrderSignatureValidator'
import { Permit2Validator } from '../util/Permit2Validator'
import { getStateMachineArn } from '../util/stateMachineArn'
import { AnalyticsServiceInterface } from './analytics-service'

export const MAX_QUERY_RETRY = 10
// For endpoints that serve exactly one page: never follow a cursor into further reads.
export const SINGLE_PAGE = 0
// From a string: BigNumber.from(Number.MAX_SAFE_INTEGER) itself throws overflow.
const MAX_SAFE_BLOCK = BigNumber.from(Number.MAX_SAFE_INTEGER.toString())

export class UniswapXOrderService {
  constructor(
    private readonly orderValidator: OffChainUniswapXOrderValidator,
    private readonly onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>,
    private readonly repository: BaseOrdersRepository<UniswapXOrderEntity>,
    private readonly limitRepository: BaseOrdersRepository<UniswapXOrderEntity>,
    private logger: Logger,
    private readonly getMaxOpenOrders: (offerer: string) => number,
    private analyticsService: AnalyticsServiceInterface,
    private readonly providerMap: ProviderMap,
    private readonly webhookProvider?: WebhookProvider,
    // How many extra pages fetchOrderPages may read to fill a type-filtered request. GET
    // /orders passes SINGLE_PAGE: every follow-up is an uncached read against the same hot
    // partition, and the handler discards the resulting cursor anyway.
    private readonly maxQueryRetry: number = MAX_QUERY_RETRY
  ) {}

  // The store logs through the service's logger. A10 hands the post path the request's own context.
  private get storeContext(): OrderStoreContext {
    return { logger: this.logger }
  }

  async createOrder(
    order: LimitOrder | DutchV2Order | PriorityOrder | DutchV3Order
  ): Promise<string> {
    // Start the open-order count alongside validation; both must pass before the
    // order is accepted but neither depends on the other. All order entities
    // store offerer as the lowercased swapper address.
    const canPlaceNewOrderPromise = this.userCanPlaceNewOrder(order.inner.info.swapper.toLowerCase())
    // If validation throws first, keep the still-pending count from surfacing as
    // an unhandled rejection; the real result is awaited below.
    canPlaceNewOrderPromise.catch(() => undefined)

    let orderEntity: UniswapXOrderEntity
    if (order instanceof LimitOrder || order instanceof DutchV2Order || order instanceof DutchV3Order) {
      await this.validateOrder(order.inner, order.signature, order.chainId)
      orderEntity = toOrderEntity(order)
    } else if (order instanceof PriorityOrder) {
      // None of the off-chain checks read the cosigner data or cosignature (nor does the order
      // hash), so an order they reject costs no getBlock RPC and no KMS signature.
      this.validateOffChain(order.inner, order.chainId)
      // toOrderEntity stores the start block as a JS number.
      if (order.inner.info.auctionStartBlock.gt(MAX_SAFE_BLOCK)) {
        throw new OrderValidationFailedError(`Invalid auctionStartBlock: must be at most ${Number.MAX_SAFE_INTEGER}`)
      }

      // following https://github.com/Uniswap/uniswapx-parameterization-api/pull/358
      // recreate KmsSigner every request
      const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
      const awsRegion = checkDefined(process.env.REGION, 'REGION is not defined')
      const cosigner = new KmsSigner(new KMSClient({ region: awsRegion }), kmsKeyId)
      const provider = this.providerMap.get(order.chainId)

      const cosignedOrder = await order.reparameterizeAndCosign(provider, cosigner)
      if (cosignedOrder.inner.info.cosignerData.auctionTargetBlock.gt(cosignedOrder.inner.info.auctionStartBlock)) {
        throw new OrderValidationFailedError('auctionStartBlock too low')
      }
      this.logger.info('cosigned priority order', {
        orderHash: cosignedOrder.inner.hash(),
        auctionTargetBlock: cosignedOrder.inner.info.cosignerData.auctionTargetBlock.toString(),
      })
      // The order quoter checks the cosignature, so this half waits for it.
      await this.validateOnChain(cosignedOrder.inner, cosignedOrder.signature, cosignedOrder.chainId)
      orderEntity = toOrderEntity(cosignedOrder)
    } else {
      throw new Error('unsupported OrderType')
    }

    const canPlaceNewOrder = await canPlaceNewOrderPromise
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    await this.persistOrder(orderEntity)

    // From here on the signed order is durably stored and fillable, so a thrown
    // error would make the caller report an accepted order as rejected
    // (SWAP-2839). Log and alarm instead of throwing.
    try {
      const realOrderType = order.orderType
      this.logOrderCreatedEvent(orderEntity, realOrderType)

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
          this.logger.warn({
            orderHash: orderEntity.orderHash,
            error: error.message || error,
            message: 'Immediate webhook notification failed, will rely on DynamoDB stream',
          })
        })
      }

      await this.startOrderTracker(orderEntity.orderHash, order.chainId, order.quoteId, realOrderType)
    } catch (err) {
      this.logger.error('Post-persist processing failed for accepted order', {
        orderHash: orderEntity.orderHash,
        err,
      })
      metrics.putMetric('PostOrderPostPersistFailure', 1, Unit.Count)
    }

    return orderEntity.orderHash
  }

  private async validateOrder(
    order: DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
    this.validateOffChain(order, chainId)
    await this.validateOnChain(order, signature, chainId)
  }

  private validateOffChain(
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder,
    chainId: number
  ): void {
    const offChainValidationResult = this.orderValidator.validate(order)
    if (!offChainValidationResult.valid) {
      // Otherwise a rule that starts rejecting real traffic only shows up as caller 400s.
      metrics.putMetric('OffchainValidationFailure', 1, Unit.Count)
      this.logger.info('offchain validation failed', {
        chainId,
        orderHash: order.hash(),
        swapper: order.info.swapper,
        reason: offChainValidationResult.errorString,
      })
      throw new OrderValidationFailedError(offChainValidationResult.errorString)
    }
  }

  // The permissioned-token checks, the order quoter and the zero-address input check.
  private async validateOnChain(
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
    const token = order.info.input.token

    if (PermissionedTokenValidator.isPermissionedToken(token, chainId)) {
      const provider = this.providerMap.get(chainId)
      // Permissioned tokens shouldn't work with priority orders
      // TODO: excluded v3 orders because harder to handle trade type etc
      if (order instanceof CosignedPriorityOrder || order instanceof CosignedV3DutchOrder) {
        throw new OrderValidationFailedError("Permissioned tokens shouldn't work with priority/v3 dutch orders")
      }
      // The order quoter cannot move permissioned tokens, so the onchain validation below is
      // unavailable here. The quoter is also what authenticates an order, so its checks that
      // do not need the tokens are reproduced offchain: the swapper signature and cosignature
      // first (a forged cosignature costs no RPC call, a forged signature one eth_getCode),
      // then the Permit2 nonce and deadline. The token's own transfer policy is a compliance
      // check on top, not a substitute.
      const signatureValidation = await new OrderSignatureValidator(provider).validate(order, signature)
      if (signatureValidation !== OrderValidation.OK) {
        const reason = OrderValidation[signatureValidation]
        this.logger.warn('permissioned order failed authentication', { orderHash: order.hash(), chainId, reason })
        metrics.putMetric('PermissionedOrderAuthenticationFailed', 1, Unit.Count)
        throw new OrderValidationFailedError(`Signature validation failed: ${reason}`)
      }
      const exclusiveFiller =
        order instanceof DutchOrder ? order.info.exclusiveFiller : order.info.cosignerData.exclusiveFiller
      const [permitValidation, preTransferCheckResult] = await Promise.all([
        new Permit2Validator(provider, chainId).validate(order),
        PermissionedTokenValidator.preTransferCheck(
          provider,
          token,
          order.info.swapper,
          exclusiveFiller,
          this.isExactInput(order) ? order.info.input.startAmount.toString() : order.info.input.endAmount.toString() // exact_out 'decay' upwards
        ),
      ])
      if (permitValidation !== OrderValidation.OK) {
        throw new OrderValidationFailedError(`Permit2 validation failed: ${OrderValidation[permitValidation]}`)
      }
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
    if (token === ethers.constants.AddressZero) {
      throw new InvalidTokenInAddress()
    }
  }

  private async userCanPlaceNewOrder(offerer: string): Promise<boolean> {
    try {
      const maxOpenOrders = this.getMaxOpenOrders(offerer)
      const orderCount = await this.repository.countOpenOrders(this.storeContext, offerer, maxOpenOrders)

      if (orderCount > maxOpenOrders) {
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
      await this.repository.putOrderAndUpdateNonce(this.storeContext, order, Math.floor(Date.now() / 1000))
      this.logger.info(`Successfully inserted Order ${order.orderHash} into DB`)
    } catch (e: unknown) {
      this.logger.error(`Failed to insert order ${order.orderHash} into DB`, {
        e,
      })
      throw e
    }
  }

  // Analytics only: a failure here must not skip the filler notice or the tracker.
  private logOrderCreatedEvent(order: UniswapXOrderEntity, orderType: OrderType) {
    try {
      // Log used for cw dashboard and redshift metrics, do not modify
      // skip fee output logging
      this.analyticsService.logOrderPosted(order, orderType)
    } catch (err) {
      this.logger.error('Failed to log OrderPosted', { orderHash: order.orderHash, err })
    }
  }

  private async startOrderTracker(
    orderHash: string,
    chainId: number,
    quoteId: string | undefined,
    orderType: OrderType
  ) {
    const stateMachineArn = getStateMachineArn(chainId)
    await kickoffOrderTrackingSfn(
      {
        orderHash: orderHash,
        chainId: chainId,
        orderStatus: ORDER_STATUS.OPEN,
        quoteId: quoteId ?? '',
        orderType,
        stateMachineArn,
        runIndex: 0,
      },
      stateMachineArn
    )
  }

  /**
   * orderType is a filter, not a key condition, so one page can match fewer rows than the
   * limit. Follow the cursor until the limit fills, the pages run out, or the retry budget
   * is spent -- a caller that still wants more follows the returned cursor.
   */
  private async fetchOrderPages(
    limit: number,
    params: GetOrdersQueryParams,
    types: string[],
    cursor: string | undefined
  ): Promise<QueryResult<UniswapXOrderEntity>> {
    let queryResults = await this.repository.getOrdersFilteredByType(limit, params, types, cursor)
    const orders = [...queryResults.orders]

    let retryCount = 0
    while (orders.length < limit && queryResults.cursor && retryCount < this.maxQueryRetry) {
      queryResults = await this.repository.getOrdersFilteredByType(limit, params, types, queryResults.cursor)
      orders.push(...queryResults.orders)
      retryCount++
    }

    return { orders, cursor: queryResults.cursor }
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
        resultList.push(toV2Response(order))
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
    const queryResults = await this.fetchOrderPages(limit, params, [OrderType.Dutch_V2], cursor)
    return { orders: queryResults.orders.map(toV2Response), cursor: queryResults.cursor }
  }

  public async getDutchV3Orders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetDutchV3OrderResponse>> {
    const queryResults = await this.fetchOrderPages(limit, params, [OrderType.Dutch_V3], cursor)
    return { orders: queryResults.orders.map(toV3Response), cursor: queryResults.cursor }
  }

  public async getDutchOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<UniswapXOrderEntity>> {
    return this.fetchOrderPages(limit, params, [OrderType.Dutch, DUTCH_LIMIT], cursor)
  }

  public async getPriorityOrders(
    limit: number,
    params: GetOrdersQueryParams,
    cursor: string | undefined
  ): Promise<GetOrdersResponse<GetPriorityOrderResponse>> {
    const queryResults = await this.fetchOrderPages(limit, params, [OrderType.Priority], cursor)
    return { orders: queryResults.orders.map(toPriorityResponse), cursor: queryResults.cursor }
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

  private isExactInput(order: DutchOrder | CosignedV2DutchOrder): boolean {
    return order.info.input.startAmount.eq(order.info.input.endAmount)
  }
}
