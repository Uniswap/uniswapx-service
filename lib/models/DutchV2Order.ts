import { CosignedV2DutchOrder as SDKV2DutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { Order } from './Order'

export class DutchV2Order extends Order {
  constructor(readonly inner: SDKV2DutchOrder, readonly signature: string, readonly chainId: number) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Dutch_V2
  }

  public formatDutchV2OrderEntity(orderStatus: ORDER_STATUS): UniswapXOrderEntity {
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
}
