import { Logger } from '@aws-lambda-powertools/logger'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { KmsSigner } from '@uniswap/signer'
import { OrderType, CosignedHybridOrder as SDKHybridOrder, HybridCosignerData } from '@uniswap/uniswapx-sdk'
import { BigNumber, ethers } from 'ethers'
import { ORDER_STATUS } from '../entities'
import { HybridOrderEntity, UniswapXOrderEntity } from '../entities/Order'
import { HYBRID_ORDER_TARGET_BLOCK_BUFFER } from '../handlers/constants'
import { AVERAGE_BLOCK_TIME } from '../handlers/check-order-status/util'
import { GetHybridOrderResponse } from '../handlers/get-orders/schema/GetHybridOrderResponse'
import { HardQuote } from '../handlers/post-order/schema'
import { Order } from './Order'
import { QuoteMetadata, Route } from '../repositories/quote-metadata-repository'
import { ChainId } from '../util/chain'
import { artemisModifyCalldata } from '../util/UniversalRouterCalldata'

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
      baselinePriorityFee: decodedOrder.info.baselinePriorityFee.toString(),
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
    const route = executeAddress && entity.route ? {
        quote: entity.route.quote,
        quoteGasAdjusted: entity.route.quoteGasAdjusted,
        gasPriceWei: entity.route.gasPriceWei,
        gasUseEstimateQuote: entity.route.gasUseEstimateQuote,
        gasUseEstimate: entity.route.gasUseEstimate,
        methodParameters : {
          calldata: artemisModifyCalldata(entity.route.methodParameters.calldata, log, executeAddress),
          value: entity.route.methodParameters.value,
          to: entity.route.methodParameters.to,
        },
      } : entity.route

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
    const currentTime = Math.floor(Date.now() / 1000) // Current time in seconds

    // Calculate if we need to add an extra block based on timestamp difference
    // This keeps the time window more consistent for fillers
    const blockTimeSeconds = AVERAGE_BLOCK_TIME(this.chainId as ChainId)
    const timeDifference = Math.abs(currentTime - block.timestamp)

    // If the difference is more than 75% of the block time, add an extra block
    const extraBlock = timeDifference > blockTimeSeconds * 0.75 ? 1 : 0

    const targetBlock = BigNumber.from(block.number)
      .add(HYBRID_ORDER_TARGET_BLOCK_BUFFER[this.chainId as ChainId])
      .add(extraBlock)
      
    // Using string literal to match style of rest of the repo  
    const scaleWorse = process.env["SCALE_WORSE"] === 'true'

    const cosignerData = this.generateCosignerData(
      targetBlock,
      scaleWorse,
      hardQuote
    )

    this.inner.info.cosignerData = cosignerData

    this.inner.info.cosignature = await cosigner.signDigest(this.inner.cosignatureHash())
    return this
  }

  /**
   * Generates cosigner data for hybrid orders.
   *
   * Hybrid orders here will only be used for the purpose of replacing DutchV2/V3 orders,
   * or Priority orders. Each order will only be either a dutch auction, or a priority
   * auction, and not both. Therefore:
   * - If the price curve is empty, returns zero target block and empty supplemental price curve.
   * - Otherwise, returns supplemental price curve based on the hardQuote data.
   *
   * @param targetBlock - The target block number for the auction
   * @param scaleWorse - Whether to allow scaling in a worse direction for the user
   * @param hardQuote - Optional hard quote data from the POST request
   * @returns The cosigner data containing auctionTargetBlock and supplementalPriceCurve
   */
  private generateCosignerData(
    targetBlock: BigNumber,
    scaleWorse: boolean,
    hardQuote?: HardQuote
  ): HybridCosignerData {
    // If no price curve, return empty cosigner data
    if (this.inner.info.priceCurve.length == 0) {
      return {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      }
    }
    
    // If no hardQuote provided, but price curve has length, simply set acution target block
    if (hardQuote == undefined) {
      return {
        auctionTargetBlock: targetBlock,
        supplementalPriceCurve: [],
      }
    }

    const BASE_SCALING_FACTOR = ethers.constants.WeiPerEther // 1e18

    // NOTE: only works for one output
    if (this.inner.info.outputs.length != 1) {
      return {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      }
    }

  const currentRateWad = (this.inner.info.outputs[0].minAmount.mul(BASE_SCALING_FACTOR)).div(this.inner.info.input.maxAmount)
  const quoteRateWas = (BigNumber.from(hardQuote?.input.amount).mul(BASE_SCALING_FACTOR)).div(BigNumber.from(hardQuote?.outputs[0].amount))
  const scale = (currentRateWad.mul(BASE_SCALING_FACTOR)).div(BigNumber.from(quoteRateWas))

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

    if (!scaleWorse) {
      if (scale.gt(BASE_SCALING_FACTOR) != this.inner.info.scalingFactor.gt(BASE_SCALING_FACTOR)) {
        return {
          auctionTargetBlock: targetBlock,
          supplementalPriceCurve: [],
        }
      }
    }

    const supplementalPriceCurve: BigNumber[] = []
    for (let i = 0; i < this.inner.info.priceCurve.length; i++) {
      const relativeDifference = (this.inner.info.priceCurve[i].mul(BASE_SCALING_FACTOR)).div(scale.sub(BASE_SCALING_FACTOR))
      supplementalPriceCurve.push(relativeDifference)
    }

    return {
      auctionTargetBlock: targetBlock,
      supplementalPriceCurve,
    }
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
