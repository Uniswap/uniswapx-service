import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { DutchOrderEntity, ORDER_STATUS } from '../entities'
import { ChainId } from '../util/chain'
import { IOrder } from './IOrder'

export class DutchV1Order implements IOrder {
  private constructor(
    readonly chainId: ChainId,
    readonly signature: string,
    readonly inner: SDKDutchOrder,
    readonly orderStatus: ORDER_STATUS,
    readonly offerer: string,
    readonly quoteId?: string
  ) {
    return
  }

  get orderType(): OrderType.Dutch {
    return OrderType.Dutch
  }

  toEntity(): DutchOrderEntity {
    const { input, outputs } = this.inner.info
    const order: DutchOrderEntity = {
      type: this.orderType,
      encodedOrder: this.inner.serialize(),
      signature: this.signature,
      nonce: this.inner.info.nonce.toString(),
      orderHash: this.inner.hash().toLowerCase(),
      chainId: this.inner.chainId,
      orderStatus: this.orderStatus,
      offerer: this.offerer,
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
      reactor: this.inner.info.reactor.toLowerCase(),
      decayStartTime: this.inner.info.decayStartTime,
      decayEndTime: this.inner.info.deadline,
      deadline: this.inner.info.deadline,
      filler: this.inner.info?.exclusiveFiller?.toLowerCase(),
      ...(this.quoteId && { quoteId: this.quoteId }),
    }

    return order
  }

  static fromSDK(
    chainId: ChainId,
    signature: string,
    inner: SDKDutchOrder,
    orderStatus: ORDER_STATUS,
    quoteId?: string
  ): DutchV1Order {
    return new DutchV1Order(chainId, signature, inner, orderStatus, inner.info.swapper.toLowerCase(), quoteId)
  }
}
