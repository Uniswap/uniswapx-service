import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { GetDutchV2OrderResponse } from '../handlers/get-orders/schema/GetDutchV2OrderResponse'
import { Order } from './Order'

export class DutchV2Order extends Order {
  constructor(
    readonly inner: SDKV2DutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly orderStatus?: ORDER_STATUS
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }

  public toEntity(orderStatus: ORDER_STATUS): UniswapXOrderEntity {
    const { input, outputs } = this.inner.info
    const decodedOrder = this.inner
    const order: UniswapXOrderEntity = {
      type: OrderType.Dutch_V2,
      encodedOrder: decodedOrder.serialize(),
      signature: this.signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash: decodedOrder.hash().toLowerCase(),
      chainId: decodedOrder.chainId,
      orderStatus: orderStatus,
      offerer: decodedOrder.info.swapper.toLowerCase(),
      input: {
        token: input.token,
        startAmount: input.startAmount.toString(),
        endAmount: input.endAmount.toString(),
      },
      outputs: outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient.toLowerCase(),
      })),
      reactor: decodedOrder.info.reactor.toLowerCase(),
      decayStartTime: decodedOrder.info.cosignerData.decayStartTime,
      decayEndTime: decodedOrder.info.deadline,
      deadline: decodedOrder.info.deadline,
      filler: decodedOrder.info?.cosignerData?.exclusiveFiller.toLowerCase(),
      cosignerData: {
        decayStartTime: decodedOrder.info.cosignerData.decayStartTime,
        decayEndTime: decodedOrder.info.cosignerData.decayEndTime,
        exclusiveFiller: decodedOrder.info.cosignerData.exclusiveFiller,
        inputOverride: decodedOrder.info.cosignerData.inputOverride.toString(),
        outputOverrides: decodedOrder.info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
      cosignature: decodedOrder.info.cosignature,
    }

    return order
  }

  public static fromEntity(entity: UniswapXOrderEntity): DutchV2Order {
    return new DutchV2Order(
      SDKV2DutchOrder.parse(entity.encodedOrder, entity.chainId),
      entity.signature,
      entity.chainId,
      entity.orderStatus
    )
  }

  public toGetResponse(): GetDutchV2OrderResponse {
    return {
      type: OrderType.Dutch_V2,
      orderStatus: this.orderStatus as ORDER_STATUS,
      signature: this.signature,
      encodedOrder: this.inner.serialize(),
      chainId: this.chainId,

      orderHash: this.inner.hash(),
      swapper: this.inner.info.swapper,
      reactor: this.inner.info.reactor,
      deadline: this.inner.info.deadline,
      input: {
        token: this.inner.info.input.token,
        startAmount: this.inner.info.input.startAmount.toString(),
        endAmount: this.inner.info.input.endAmount.toString(),
      },
      outputs: this.inner.info.outputs.map((o) => {
        return {
          token: o.token,
          startAmount: o.startAmount.toString(),
          endAmount: o.endAmount.toString(),
          recipient: o.recipient,
        }
      }),
      cosignerData: {
        decayStartTime: this.inner.info.cosignerData.decayStartTime,
        decayEndTime: this.inner.info.cosignerData.decayEndTime,
        exclusiveFiller: this.inner.info.cosignerData.exclusiveFiller,
        inputOverride: this.inner.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.inner.info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
      cosignature: this.inner.info.cosignature,
    }
  }
}
