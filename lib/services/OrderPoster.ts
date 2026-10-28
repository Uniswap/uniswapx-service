import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  OrderValidator as OnChainOrderValidator,
  OrderType,
  OrderValidation,
  PermissionedTokenValidator,
} from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { BigNumber, ethers } from 'ethers'
import { toOrderEntity } from '../core/orders/storedRow'
import { UniswapXOrderEntity } from '../entities'
import { InvalidTokenInAddress } from '../errors/InvalidTokenInAddress'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { TooManyOpenOrdersError } from '../errors/TooManyOpenOrdersError'
import { RequestLogger } from '../handlers/base/request-context'
import { OnChainValidatorMap } from '../handlers/OnChainValidatorMap'
import { ExclusiveFillerWebhookOrder } from '../handlers/order-notification/types'
import { ProviderMap } from '../handlers/shared'
import { DutchV2Order } from '../models/DutchV2Order'
import { DutchV3Order } from '../models/DutchV3Order'
import { LimitOrder } from '../models/LimitOrder'
import { PriorityCosigner, PriorityOrder } from '../models/PriorityOrder'
import { BaseOrdersRepository, PutOrderResult } from '../repositories/base'
import { hasExclusiveFiller } from '../util/address'
import { IMetrics } from '../util/metrics'
import { OffChainUniswapXOrderValidator } from '../util/OffChainUniswapXOrderValidator'
import { OrderSignatureValidator } from '../util/OrderSignatureValidator'
import { Permit2Validator } from '../util/Permit2Validator'
import { AnalyticsServiceInterface } from './analytics-service'
import { StartTracking } from './start-tracking'

// From a string: BigNumber.from(Number.MAX_SAFE_INTEGER) itself throws overflow.
const MAX_SAFE_BLOCK = BigNumber.from(Number.MAX_SAFE_INTEGER.toString())

// The request a post runs for: its logs and metrics go to that request's own logger and metrics.
export type PostContext = {
  logger: RequestLogger
  metrics: IMetrics
}

// Pushes a newly stored order to its exclusive filler. Fire-and-forget: a failure, thrown or
// rejected, is logged and never fails the post, since the order is already stored.
export type ExclusiveFillerNotifier = (
  order: ExclusiveFillerWebhookOrder,
  orderType: OrderType,
  logger: RequestLogger
) => Promise<void>

// Everything a post reaches outside its own code. Built from the environment in
// handlers/post-order/lambda.ts, from fakes in tests.
export type OrderPosterDeps = {
  orderValidator: OffChainUniswapXOrderValidator
  onChainValidatorMap: OnChainValidatorMap<OnChainOrderValidator>
  repository: BaseOrdersRepository<UniswapXOrderEntity>
  getMaxOpenOrders: (offerer: string) => number
  analytics: AnalyticsServiceInterface
  providerMap: ProviderMap
  startTracking: StartTracking
  // Called once per priority order, so each gets a new signer (uniswapx-parameterization-api#358).
  createPriorityCosigner: () => PriorityCosigner
  // Epoch milliseconds.
  now: () => number
  // Only where the route notifies exclusive fillers right away.
  notifyExclusiveFiller?: ExclusiveFillerNotifier
}

// Validates, stores and starts tracking a posted order. GET reads live in get-orders/order-reader.ts.
export class OrderPoster {
  constructor(private readonly deps: OrderPosterDeps) {}

  async createOrder(
    ctx: PostContext,
    order: LimitOrder | DutchV2Order | PriorityOrder | DutchV3Order
  ): Promise<string> {
    // Start the open-order count alongside validation; both must pass before the
    // order is accepted but neither depends on the other. All order entities
    // store offerer as the lowercased swapper address.
    const canPlaceNewOrderPromise = this.userCanPlaceNewOrder(ctx, order.inner.info.swapper.toLowerCase())
    // If validation throws first, keep the still-pending count from surfacing as
    // an unhandled rejection; the real result is awaited below.
    canPlaceNewOrderPromise.catch(() => undefined)

    let orderEntity: UniswapXOrderEntity
    if (order instanceof LimitOrder || order instanceof DutchV2Order || order instanceof DutchV3Order) {
      await this.validateOrder(ctx, order.inner, order.signature, order.chainId)
      orderEntity = toOrderEntity(order)
    } else if (order instanceof PriorityOrder) {
      // None of the off-chain checks read the cosigner data or cosignature (nor does the order
      // hash), so an order they reject costs no getBlock RPC and no KMS signature.
      this.validateOffChain(ctx, order.inner, order.chainId)
      // toOrderEntity stores the start block as a JS number.
      if (order.inner.info.auctionStartBlock.gt(MAX_SAFE_BLOCK)) {
        throw new OrderValidationFailedError(`Invalid auctionStartBlock: must be at most ${Number.MAX_SAFE_INTEGER}`)
      }

      const cosigner = this.deps.createPriorityCosigner()
      const provider = this.deps.providerMap.get(order.chainId)

      const cosignedOrder = await order.reparameterizeAndCosign(provider, cosigner, Math.floor(this.deps.now() / 1000))
      if (cosignedOrder.inner.info.cosignerData.auctionTargetBlock.gt(cosignedOrder.inner.info.auctionStartBlock)) {
        throw new OrderValidationFailedError('auctionStartBlock too low')
      }
      ctx.logger.info('cosigned priority order', {
        orderHash: cosignedOrder.inner.hash(),
        auctionTargetBlock: cosignedOrder.inner.info.cosignerData.auctionTargetBlock.toString(),
      })
      // The order quoter checks the cosignature, so this half waits for it.
      await this.validateOnChain(ctx, cosignedOrder.inner, cosignedOrder.signature, cosignedOrder.chainId)
      orderEntity = toOrderEntity(cosignedOrder)
    } else {
      throw new Error('unsupported OrderType')
    }

    const canPlaceNewOrder = await canPlaceNewOrderPromise
    if (!canPlaceNewOrder) {
      throw new TooManyOpenOrdersError()
    }

    if ((await this.persistOrder(ctx, orderEntity)) === 'already-stored') {
      // A re-post: the first post stored the order, logged its analytics record, notified its
      // exclusive filler and started its tracker, so this one answers the same and does nothing else.
      ctx.logger.warn('Order already stored; answering the re-post without writing', {
        orderHash: orderEntity.orderHash,
      })
      ctx.metrics.putMetric('PostOrderRepost', 1, Unit.Count)
      return orderEntity.orderHash
    }

    // From here on the signed order is durably stored and fillable, so a thrown
    // error would make the caller report an accepted order as rejected
    // (SWAP-2839). Log and alarm instead of throwing.
    try {
      const realOrderType = order.orderType
      this.logOrderCreatedEvent(ctx, orderEntity, realOrderType)

      // Send immediate notification to exclusive filler if present
      const notifyExclusiveFiller = this.deps.notifyExclusiveFiller
      if (notifyExclusiveFiller && hasExclusiveFiller(orderEntity.filler)) {
        // Create properly typed webhook order data
        const exclusiveFillerOrder: ExclusiveFillerWebhookOrder = {
          orderHash: orderEntity.orderHash,
          // In milliseconds, unlike the stored row's seconds: fillers consume it this way.
          createdAt: orderEntity.createdAt ?? this.deps.now(),
          signature: orderEntity.signature,
          offerer: orderEntity.offerer,
          orderStatus: orderEntity.orderStatus,
          encodedOrder: orderEntity.encodedOrder,
          chainId: orderEntity.chainId,
          quoteId: orderEntity.quoteId,
          filler: orderEntity.filler,
          orderType: realOrderType,
        }

        // Don't await to minimize latency-add to order posting flow. Called inside a promise so a
        // notifier that throws before returning one also lands in this catch and tracking still starts.
        Promise.resolve()
          .then(() => notifyExclusiveFiller(exclusiveFillerOrder, realOrderType, ctx.logger))
          .catch((error) => {
            ctx.logger.warn({
              orderHash: orderEntity.orderHash,
              error: error.message || error,
              message: 'Immediate webhook notification failed, will rely on DynamoDB stream',
            })
          })
      }

      await this.startOrderTracker(ctx, orderEntity.orderHash, order.chainId, order.quoteId, realOrderType)
    } catch (err) {
      ctx.logger.error('Post-persist processing failed for accepted order', {
        orderHash: orderEntity.orderHash,
        err,
      })
      ctx.metrics.putMetric('PostOrderPostPersistFailure', 1, Unit.Count)
    }

    return orderEntity.orderHash
  }

  private async validateOrder(
    ctx: PostContext,
    order: DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
    this.validateOffChain(ctx, order, chainId)
    await this.validateOnChain(ctx, order, signature, chainId)
  }

  private validateOffChain(
    ctx: PostContext,
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder,
    chainId: number
  ): void {
    const offChainValidationResult = this.deps.orderValidator.validate(order)
    if (!offChainValidationResult.valid) {
      // Otherwise a rule that starts rejecting real traffic only shows up as caller 400s.
      ctx.metrics.putMetric('OffchainValidationFailure', 1, Unit.Count)
      ctx.logger.info('offchain validation failed', {
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
    ctx: PostContext,
    order: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder | CosignedV3DutchOrder,
    signature: string,
    chainId: number
  ): Promise<void> {
    const token = order.info.input.token

    if (PermissionedTokenValidator.isPermissionedToken(token, chainId)) {
      const provider = this.deps.providerMap.get(chainId)
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
        ctx.logger.warn('permissioned order failed authentication', { orderHash: order.hash(), chainId, reason })
        ctx.metrics.putMetric('PermissionedOrderAuthenticationFailed', 1, Unit.Count)
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
      const onChainValidator = this.deps.onChainValidatorMap.get(chainId)
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

  private async userCanPlaceNewOrder(ctx: PostContext, offerer: string): Promise<boolean> {
    try {
      const maxOpenOrders = this.deps.getMaxOpenOrders(offerer)
      const orderCount = await this.deps.repository.countOpenOrders(ctx, offerer, maxOpenOrders)

      if (orderCount > maxOpenOrders) {
        ctx.logger.info(`${offerer} has too many open orders`, {
          orderCount,
        })
        return false
      }
      return true
    } catch (e) {
      ctx.logger.error(`failed to fetch open order count for ${offerer}`, {
        e,
      })
      throw e
    }
  }

  private async persistOrder(ctx: PostContext, order: UniswapXOrderEntity): Promise<PutOrderResult> {
    try {
      const result = await this.deps.repository.putOrderAndUpdateNonce(ctx, order, Math.floor(this.deps.now() / 1000))
      if (result === 'stored') {
        ctx.logger.info(`Successfully inserted Order ${order.orderHash} into DB`)
      }
      return result
    } catch (e: unknown) {
      ctx.logger.error(`Failed to insert order ${order.orderHash} into DB`, {
        e,
      })
      throw e
    }
  }

  // Analytics only: a failure here must not skip the filler notice or the tracker.
  private logOrderCreatedEvent(ctx: PostContext, order: UniswapXOrderEntity, orderType: OrderType) {
    try {
      // Log used for cw dashboard and redshift metrics, do not modify
      // skip fee output logging
      this.deps.analytics.logOrderPosted(order, orderType)
    } catch (err) {
      ctx.logger.error('Failed to log OrderPosted', { orderHash: order.orderHash, err })
    }
  }

  private async startOrderTracker(
    ctx: PostContext,
    orderHash: string,
    chainId: number,
    quoteId: string | undefined,
    orderType: OrderType
  ) {
    const result = await this.deps.startTracking.start({ orderHash, chainId, quoteId, orderType })
    // Counted on its own so PostOrderPostPersistFailure only counts trackers that failed to start.
    if (result === 'already-started') {
      ctx.logger.warn('Order tracker already exists for re-posted order', { orderHash })
      ctx.metrics.putMetric('PostOrderTrackerAlreadyExists', 1, Unit.Count)
      return
    }
    // The post-persist catch in createOrder swallows a failed start, so request metrics look the
    // same whether tracking started or not. lambda-stack alarms when this counter stops.
    ctx.metrics.putMetric('OrderTrackerStarted', 1, Unit.Count)
  }

  private isExactInput(order: DutchOrder | CosignedV2DutchOrder): boolean {
    return order.info.input.startAmount.eq(order.info.input.endAmount)
  }
}
