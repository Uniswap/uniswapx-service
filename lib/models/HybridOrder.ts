import { Logger } from '@aws-lambda-powertools/logger'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { KmsSigner } from '@uniswap/signer'
import { CosignedHybridOrder as SDKHybridOrder, HybridCosignerData, OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ORDER_STATUS } from '../entities'
import { HybridOrderEntity, UniswapXOrderEntity } from '../entities/Order'
import { CosigningError } from '../errors/CosigningError'
import { AVERAGE_BLOCK_TIME } from '../handlers/check-order-status/util'
import { BASE_SCALING_FACTOR, HYBRID_ORDER_TARGET_BLOCK_BUFFER, SCALING_FACTOR_MASK } from '../handlers/constants'
import { GetHybridOrderResponse } from '../handlers/get-orders/schema/GetHybridOrderResponse'
import { HardQuote } from '../handlers/post-order/schema'
import { QuoteMetadata, Route } from '../repositories/quote-metadata-repository'
import { ChainId } from '../util/chain'
import { InitializerClient, INITIALIZER_COSIGN_HYBRID_PATH, INITIALIZER_URL } from '../util/initializer'
import { artemisModifyCalldata } from '../util/UniversalRouterCalldata'
import { Order } from './Order'

interface InitializerCosignResponse {
  success: boolean
  receivedFeedIds: string[]
  usedFeedIds: string[]
  signedOrder: {
    orderType: string
    info: Record<string, unknown>
    cosigner: string
    input: Record<string, unknown>
    outputs: Record<string, unknown>[]
    cosignerData: {
      auctionTargetBlock: number
      supplementalPriceCurve: string[]
    }
    cosignature: string
  }
  chainId: number
  encodedOrder: string
  processingStatus: string
  timestamp: number
}

export class HybridOrder extends Order {
  constructor(
    readonly inner: SDKHybridOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly orderStatus?: ORDER_STATUS,
    readonly txHash?: string,
    readonly quoteId?: string,
    readonly requestId?: string,
    readonly createdAt?: number,
    readonly settledAmounts?: {
      tokenOut: string
      amountOut: string
      tokenIn: string
      amountIn: string
    }[],
    readonly route?: Route,
    readonly hardQuote?: HardQuote
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Hybrid
  }

  public toEntity(orderStatus: ORDER_STATUS, quoteMetadata?: QuoteMetadata): HybridOrderEntity {
    const { input, outputs } = this.inner.info
    const decodedOrder = this.inner
    const order: HybridOrderEntity = {
      type: OrderType.Hybrid,
      encodedOrder: decodedOrder.serialize(),
      signature: this.signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash: decodedOrder.hash().toLowerCase(),
      chainId: decodedOrder.chainId,
      orderStatus: orderStatus,
      offerer: decodedOrder.info.swapper.toLowerCase(),
      auctionStartBlock: decodedOrder.info.auctionStartBlock.toNumber(),
      baselinePriorityFeeWei: decodedOrder.info.baselinePriorityFee.toString(),
      scalingFactor: decodedOrder.info.scalingFactor.toString(),
      input: {
        token: input.token,
        maxAmount: input.maxAmount.toString(),
      },
      outputs: outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient.toLowerCase(),
      })),
      priceCurve: decodedOrder.info.priceCurve.map((p) => p.toString()),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      deadline: decodedOrder.info.deadline,
      cosigner: decodedOrder.info.cosigner.toLowerCase(),
      cosignerData: {
        auctionTargetBlock: decodedOrder.info.cosignerData.auctionTargetBlock.toNumber(),
        supplementalPriceCurve: decodedOrder.info.cosignerData.supplementalPriceCurve.map((p) => p.toString()),
      },
      txHash: this.txHash,
      cosignature: decodedOrder.info.cosignature,
      quoteId: this.quoteId,
      requestId: this.requestId,
      createdAt: this.createdAt,
      referencePrice: quoteMetadata?.referencePrice,
      priceImpact: quoteMetadata?.priceImpact,
      blockNumber: quoteMetadata?.blockNumber,
      route: quoteMetadata?.route,
      pair: quoteMetadata?.pair,
    }

    return order
  }

  public static fromEntity(entity: UniswapXOrderEntity, log: Logger, executeAddress?: string): HybridOrder {
    const route =
      executeAddress && entity.route
        ? {
            quote: entity.route.quote,
            quoteGasAdjusted: entity.route.quoteGasAdjusted,
            gasPriceWei: entity.route.gasPriceWei,
            gasUseEstimateQuote: entity.route.gasUseEstimateQuote,
            gasUseEstimate: entity.route.gasUseEstimate,
            methodParameters: {
              calldata: artemisModifyCalldata(entity.route.methodParameters.calldata, log, executeAddress),
              value: entity.route.methodParameters.value,
              to: entity.route.methodParameters.to,
            },
          }
        : entity.route

    return new HybridOrder(
      SDKHybridOrder.parse(entity.encodedOrder, entity.chainId),
      entity.signature,
      entity.chainId,
      entity.orderStatus,
      entity.txHash,
      entity.quoteId,
      entity.requestId,
      entity.createdAt,
      entity.settledAmounts,
      route
    )
  }

  public async reparameterizeAndCosign(
    provider: StaticJsonRpcProvider,
    cosigner: KmsSigner,
    hardQuote?: HardQuote
  ): Promise<this> {
    const block = await provider.getBlock('latest')
    const currentTime = Math.floor(Date.now() / 1000)

    // Calculate if we need to add an extra block based on timestamp difference
    // This keeps the time window more consistent for fillers
    const blockTimeSeconds = AVERAGE_BLOCK_TIME(this.chainId as ChainId)
    const timeDifference = Math.abs(currentTime - block.timestamp)

    // If the difference is more than 75% of the block time, add an extra block
    const extraBlock = timeDifference > blockTimeSeconds * 0.75 ? 1 : 0

    const targetBlock = BigNumber.from(block.number)
      .add(HYBRID_ORDER_TARGET_BLOCK_BUFFER[this.chainId as ChainId])
      .add(extraBlock)

    const scaleWorse = process.env['SCALE_WORSE'] === 'true'

    const cosignerData = this.generateCosignerData(targetBlock, scaleWorse, hardQuote)

    this.inner.info.cosignerData = cosignerData

    if (INITIALIZER_URL?.length ?? 0 > 0) {
      const cosignature = await this.fetchCosignatureFromInitializer()
      this.inner.info.cosignature = cosignature
    } else {
      this.inner.info.cosignature = await cosigner.signDigest(this.inner.cosignatureHash())
    }

    return this
  }

  private async fetchCosignatureFromInitializer(): Promise<string> {
    const payload = {
      hybridOrder: this.inner.serialize(),
      // TODO: integrate UDO to get signedFeeds
      signedFeeds: [],
      chainId: this.chainId,
    }

    const response = await InitializerClient.post<InitializerCosignResponse>(INITIALIZER_COSIGN_HYBRID_PATH, payload)

    if (!response.data.success) {
      throw new CosigningError(`Initializer cosign request failed: processingStatus=${response.data.processingStatus}`)
    }

    return response.data.signedOrder.cosignature
  }

  private generateCosignerData(targetBlock: BigNumber, scaleWorse: boolean, hardQuote?: HardQuote): HybridCosignerData {
    if (this.inner.info.priceCurve.length == 0) {
      return {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      }
    }

    // If no hardQuote provided, but price curve has length, simply set auction target block
    if (hardQuote == undefined) {
      return {
        auctionTargetBlock: targetBlock,
        supplementalPriceCurve: [],
      }
    }

    const scale = this.calculateScale(hardQuote, BASE_SCALING_FACTOR)

    if (scale.eq(BASE_SCALING_FACTOR)) {
      return {
        auctionTargetBlock: targetBlock,
        supplementalPriceCurve: [],
      }
    }

    if (this.inner.info.scalingFactor.eq(BASE_SCALING_FACTOR)) {
      return {
        auctionTargetBlock: targetBlock,
        supplementalPriceCurve: [],
      }
    }

    const isExactInput = this.isExactInput()

    if (!scaleWorse) {
      if (scale.lt(BASE_SCALING_FACTOR)) {
        return {
          auctionTargetBlock: targetBlock,
          supplementalPriceCurve: [],
        }
      }
    }

    const supplementalPriceCurve = this.generateSupplementalPriceCurve(scale, isExactInput)

    return {
      auctionTargetBlock: targetBlock,
      supplementalPriceCurve,
    }
  }

  private generateSupplementalPriceCurve(scale: BigNumber, isExactInput: boolean): BigNumber[] {
    const supplementalPriceCurve: BigNumber[] = []
    for (let i = 0; i < this.inner.info.priceCurve.length; i++) {
      const extractedElement = this.extractElement(this.inner.info.priceCurve[i])
      if (this.inner.info.scalingFactor.gt(BASE_SCALING_FACTOR) != extractedElement.gt(BASE_SCALING_FACTOR)) {
        throw new CosigningError('Scaling factor and price curve direction mismatch')
      }
      if (isExactInput) {
        let newElement = extractedElement.mul(scale).div(BASE_SCALING_FACTOR)
        newElement = newElement.sub(extractedElement).add(BASE_SCALING_FACTOR)
        const distFromBase = extractedElement.add(newElement.sub(BASE_SCALING_FACTOR)).sub(BASE_SCALING_FACTOR)
        if (distFromBase.lt(0)) {
          newElement = newElement.sub(distFromBase)
        }
        // Exact input: better price means more output, scale UP the curve
        supplementalPriceCurve.push(newElement)
      } else {
        let newElement = extractedElement.mul(BASE_SCALING_FACTOR).div(scale)
        newElement = newElement.sub(extractedElement).add(BASE_SCALING_FACTOR)
        const distFromBase = extractedElement.add(newElement.sub(BASE_SCALING_FACTOR)).sub(BASE_SCALING_FACTOR)
        if (distFromBase.gt(0)) {
          newElement = newElement.sub(distFromBase)
        }
        // Exact output: better price means less input, scale DOWN the curve
        supplementalPriceCurve.push(newElement)
      }
    }
    return supplementalPriceCurve
  }

  private extractElement(priceCurveElement: BigNumber): BigNumber {
    return priceCurveElement.and(SCALING_FACTOR_MASK)
  }

  private calculateScale(hardQuote: HardQuote, baseScalingFactor: BigNumber): BigNumber {
    if (this.isExactInput()) {
      return this.calculateExactInputScale(hardQuote, baseScalingFactor)
    } else {
      return this.calculateExactOutputScale(hardQuote, baseScalingFactor)
    }
  }

  private isExactInput(): boolean {
    if (this.inner.info.scalingFactor.eq(BASE_SCALING_FACTOR)) {
      if (this.inner.info.priceCurve.length == 0) {
        throw new CosigningError('Price curve is empty and scaling factor is neutral')
      }
      if (this.inner.info.priceCurve?.[0].gt(BASE_SCALING_FACTOR)) {
        return true
      } else if (this.inner.info.priceCurve?.[0].lt(BASE_SCALING_FACTOR)) {
        return false
      } else {
        throw new CosigningError('Both price curve and scaling factor are neutral')
      }
    } else if (this.inner.info.scalingFactor.gt(BASE_SCALING_FACTOR)) {
      return true
    } else {
      return false
    }
  }

  private calculateExactInputScale(hardQuote: HardQuote, baseScalingFactor: BigNumber): BigNumber {
    // For exact input orders with multiple outputs, scaling must be handled by the remote initializer
    // because we need separate quotes for each output to properly weight them
    if (this.inner.info.outputs.length > 1) {
      throw new CosigningError('Exact input orders with multiple outputs must be cosigned by the remote initializer')
    }

    const orderMinOutput = this.inner.info.outputs[0].minAmount
    if (orderMinOutput.isZero()) {
      return baseScalingFactor
    }

    if (hardQuote.outputs.length > 1) {
      throw new CosigningError('Hard quote outputs length can only be 1 for locally cosigned exact input orders')
    }

    const newOutput = BigNumber.from(hardQuote.outputs[0].amount)
    if (newOutput.isZero()) {
      return baseScalingFactor
    }

    // scale = maxInput / totalProjectedInput (in WAD terms)
    return newOutput.mul(baseScalingFactor).div(orderMinOutput)
  }

  private calculateExactOutputScale(hardQuote: HardQuote, baseScalingFactor: BigNumber): BigNumber {
    const orderMaxInput = this.inner.info.input.maxAmount
    const quoteInput = BigNumber.from(hardQuote.input.amount)

    // Avoid division by zero
    if (quoteInput.isZero()) {
      return baseScalingFactor
    }

    // scale = maxInput / quoteInput (in WAD terms)
    return orderMaxInput.mul(baseScalingFactor).div(quoteInput)
  }

  public toGetResponse(): GetHybridOrderResponse {
    return {
      type: OrderType.Hybrid,
      orderStatus: this.orderStatus as ORDER_STATUS,
      signature: this.signature,
      encodedOrder: this.inner.serialize(),
      chainId: this.chainId,
      nonce: this.inner.info.nonce.toString(),
      txHash: this.txHash,
      orderHash: this.inner.hash(),
      swapper: this.inner.info.swapper,
      reactor: this.inner.info.reactor,
      deadline: this.inner.info.deadline,
      auctionStartBlock: this.inner.info.auctionStartBlock.toNumber(),
      baselinePriorityFee: this.inner.info.baselinePriorityFee.toString(),
      scalingFactor: this.inner.info.scalingFactor.toString(),
      input: {
        token: this.inner.info.input.token,
        maxAmount: this.inner.info.input.maxAmount.toString(),
      },
      outputs: this.inner.info.outputs.map((o) => ({
        token: o.token,
        minAmount: o.minAmount.toString(),
        recipient: o.recipient,
      })),
      priceCurve: this.inner.info.priceCurve.map((p) => p.toString()),
      settledAmounts: this.settledAmounts,
      cosigner: this.inner.info.cosigner,
      cosignerData: {
        auctionTargetBlock: this.inner.info.cosignerData.auctionTargetBlock.toNumber(),
        supplementalPriceCurve: this.inner.info.cosignerData.supplementalPriceCurve.map((p) => p.toString()),
      },
      cosignature: this.inner.info.cosignature,
      quoteId: this.quoteId,
      requestId: this.requestId,
      createdAt: this.createdAt,
      route: this.route,
    }
  }
}
