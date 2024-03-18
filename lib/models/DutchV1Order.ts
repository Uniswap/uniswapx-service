import {
  DutchInput,
  DutchOrder as SDKDutchOrder,
  DutchOrderBuilder,
  DutchOutput,
  OrderType,
} from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { DutchOrderEntity, ORDER_STATUS } from '../entities'
import { ChainId } from '../util/chain'
import { IOrder } from './IOrder'

export class DutchV1Order implements IOrder {
  private constructor(
    readonly chainId: ChainId,
    readonly signature: string,
    readonly orderStatus: ORDER_STATUS,
    readonly offerer: string,

    readonly encodedOrder: string,
    readonly nonce: BigNumber,
    readonly orderHash: string,

    readonly input: DutchInput,
    readonly outputs: DutchOutput[],

    readonly reactor: string,

    readonly decayStartTime: number,
    readonly decayEndTime: number,
    readonly deadline: number,

    readonly filler?: string,

    readonly quoteId?: string
  ) {
    return
  }

  get orderType(): OrderType.Dutch {
    return OrderType.Dutch
  }

  toEntity(): DutchOrderEntity {
    const order: DutchOrderEntity = {
      type: this.orderType,
      encodedOrder: this.encodedOrder,
      signature: this.signature,
      nonce: this.nonce.toString(),
      orderHash: this.orderHash,
      chainId: this.chainId,
      orderStatus: this.orderStatus,
      offerer: this.offerer,
      input: {
        token: this.input.token,
        startAmount: this.input.startAmount.toString(),
        endAmount: this.input.endAmount.toString(),
      },
      outputs: this.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient.toLowerCase(),
      })),
      reactor: this.reactor,
      decayStartTime: this.decayStartTime,
      decayEndTime: this.decayEndTime,
      deadline: this.deadline,
      filler: this.filler,
      ...(this.quoteId && { quoteId: this.quoteId }),
    }

    return order
  }

  toSDK(): SDKDutchOrder {
    let builder = new DutchOrderBuilder(this.chainId)
    builder = builder
      .deadline(this.deadline)
      .decayEndTime(this.decayEndTime)
      .decayStartTime(this.decayStartTime)
      .swapper(this.offerer)
      .nonce(this.nonce)
      .input({
        token: this.input.token,
        startAmount: this.input.startAmount,
        endAmount: this.input.endAmount,
      })

    for (const output of this.outputs) {
      builder.output({
        token: output.token,
        startAmount: output.startAmount,
        endAmount: output.endAmount,
        recipient: output.recipient,
      })
    }

    return builder.build()
  }

  static fromSDK(
    chainId: ChainId,
    signature: string,
    inner: SDKDutchOrder,
    orderStatus: ORDER_STATUS,
    quoteId?: string
  ): DutchV1Order {
    return new DutchV1Order(
      chainId,
      signature,
      orderStatus,

      inner.info.swapper.toLowerCase(),
      inner.serialize(),

      inner.info.nonce,
      inner.hash().toLowerCase(),

      inner.info.input,
      inner.info.outputs,
      inner.info.reactor.toLowerCase(),

      inner.info.decayStartTime,
      inner.info.decayEndTime,
      inner.info.deadline,

      inner.info?.exclusiveFiller?.toLowerCase(),
      quoteId
    )
  }
}
