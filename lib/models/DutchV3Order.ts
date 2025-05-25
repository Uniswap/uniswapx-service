import { CosignedV3DutchOrder as SDKV3DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { Order } from './Order'
import { GetDutchV3OrderResponse } from '../handlers/get-orders/schema/GetDutchV3OrderResponse'
import { QuoteMetadata, Route } from '../repositories/quote-metadata-repository'
import { Logger } from '@aws-lambda-powertools/logger'
import { artemisModifyCalldata } from '../util/UniversalRouterCalldata'

export class DutchV3Order extends Order {
  constructor(
    readonly inner: SDKV3DutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly orderStatus?: ORDER_STATUS,
    readonly txHash?: string,
    readonly fillBlock?: number,
    readonly quoteId?: string,
    readonly requestId?: string,
    readonly createdAt?: number,
    readonly settledAmounts?: {
      tokenOut: string
      amountOut: string
      tokenIn: string
      amountIn: string
    }[],
    readonly route?: Route
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch_V3
  }

  public toEntity(orderStatus: ORDER_STATUS, quoteMetadata?: QuoteMetadata): UniswapXOrderEntity {
    const { input, outputs } = this.inner.info
    const decodedOrder = this.inner
    const order: UniswapXOrderEntity = {
      type: OrderType.Dutch_V3,
      encodedOrder: decodedOrder.serialize(),
      signature: this.signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash: decodedOrder.hash().toLowerCase(),
      chainId: decodedOrder.chainId,
      orderStatus: orderStatus,
      offerer: decodedOrder.info.swapper.toLowerCase(),
      startingBaseFee: decodedOrder.info.startingBaseFee.toString(),
      input: {
        token: input.token,
        startAmount: input.startAmount.toString(),
        curve: {
          relativeBlocks: input.curve.relativeBlocks,
          relativeAmounts: input.curve.relativeAmounts.map((a) => a.toString()),
        },
        maxAmount: input.maxAmount.toString(),
        adjustmentPerGweiBaseFee: input.adjustmentPerGweiBaseFee.toString(),
      },
      outputs: outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        curve: {
          relativeBlocks: output.curve.relativeBlocks,
          relativeAmounts: output.curve.relativeAmounts.map((a) => a.toString()),
        },
        minAmount: output.minAmount.toString(),
        recipient: output.recipient.toLowerCase(),
        adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee.toString(),
      })),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      deadline: decodedOrder.info.deadline,
      filler: decodedOrder.info?.cosignerData?.exclusiveFiller.toLowerCase(),
      cosignerData: {
        decayStartBlock: decodedOrder.info.cosignerData.decayStartBlock,
        exclusiveFiller: decodedOrder.info.cosignerData.exclusiveFiller,
        inputOverride: decodedOrder.info.cosignerData.inputOverride.toString(),
        outputOverrides: decodedOrder.info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
      txHash: this.txHash,
      fillBlock: this.fillBlock,
      cosignature: decodedOrder.info.cosignature,
      quoteId: this.quoteId,
      requestId: this.requestId,
      createdAt: this.createdAt,
      usedUnimind: quoteMetadata?.usedUnimind ?? false,
      ...(quoteMetadata && {
        referencePrice: quoteMetadata.referencePrice,
        priceImpact: quoteMetadata.priceImpact,
        route: quoteMetadata.route,
        pair: quoteMetadata.pair
      })
    }

    return order
  }

  public static fromEntity(entity: UniswapXOrderEntity, log: Logger, executeAddress?: string): DutchV3Order {
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
    return new DutchV3Order(
      SDKV3DutchOrder.parse(entity.encodedOrder, entity.chainId),
      entity.signature,
      entity.chainId,
      entity.orderStatus,
      entity.txHash,
      entity.fillBlock,
      entity.quoteId,
      entity.requestId,
      entity.createdAt,
      entity.settledAmounts,
      route
    )
  }

  public toGetResponse(): GetDutchV3OrderResponse {
    return {
      type: OrderType.Dutch_V3,
      orderStatus: this.orderStatus as ORDER_STATUS,
      signature: this.signature,
      encodedOrder: this.inner.serialize(),
      chainId: this.chainId,
      nonce: this.inner.info.nonce.toString(),
      txHash: this.txHash,
      fillBlock: this.fillBlock,
      orderHash: this.inner.hash(),
      swapper: this.inner.info.swapper,
      reactor: this.inner.info.reactor,
      deadline: this.inner.info.deadline,
      startingBaseFee: this.inner.info.startingBaseFee.toString(),
      input: {
        token: this.inner.info.input.token,
        startAmount: this.inner.info.input.startAmount.toString(),
        curve: {
          relativeBlocks: this.inner.info.input.curve.relativeBlocks,
          relativeAmounts: this.inner.info.input.curve.relativeAmounts.map((a) => a.toString()),
        },
        maxAmount: this.inner.info.input.maxAmount.toString(),
        adjustmentPerGweiBaseFee: this.inner.info.input.adjustmentPerGweiBaseFee.toString(),
      },
      outputs: this.inner.info.outputs.map((o) => {
        return {
          token: o.token,
          startAmount: o.startAmount.toString(),
          curve: {
            relativeBlocks: o.curve.relativeBlocks,
            relativeAmounts: o.curve.relativeAmounts.map((a) => a.toString()),
          },
          minAmount: o.minAmount.toString(),
          recipient: o.recipient,
          adjustmentPerGweiBaseFee: o.adjustmentPerGweiBaseFee.toString(),
        }
      }),
      settledAmounts: this.settledAmounts,
      cosignerData: {
        decayStartBlock: this.inner.info.cosignerData.decayStartBlock,
        exclusiveFiller: this.inner.info.cosignerData.exclusiveFiller,
        inputOverride: this.inner.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.inner.info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
      cosignature: this.inner.info.cosignature,
      quoteId: this.quoteId,
      requestId: this.requestId,
      createdAt: this.createdAt,
      route: this.route,
    }
  }
}
