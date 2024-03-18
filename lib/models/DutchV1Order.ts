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
  readonly chainId: ChainId
  readonly signature: string
  readonly orderStatus: ORDER_STATUS
  readonly offerer: string

  readonly encodedOrder: string
  readonly nonce: BigNumber
  readonly orderHash: string

  readonly input: DutchInput
  readonly outputs: DutchOutput[]

  readonly reactor: string

  readonly decayStartTime: number
  readonly decayEndTime: number
  readonly deadline: number

  readonly filler?: string

  readonly quoteId?: string

  private constructor({
    chainId,
    signature,
    orderStatus,
    offerer,
    encodedOrder,
    nonce,
    orderHash,
    input,
    outputs,
    reactor,
    decayStartTime,
    decayEndTime,
    deadline,
    filler,
    quoteId,
  }: {
    chainId: ChainId
    signature: string
    orderStatus: ORDER_STATUS
    offerer: string

    encodedOrder: string
    nonce: BigNumber
    orderHash: string

    input: DutchInput
    outputs: DutchOutput[]

    reactor: string

    decayStartTime: number
    decayEndTime: number
    deadline: number

    filler?: string

    quoteId?: string
  }) {
    this.chainId = chainId
    this.signature = signature
    this.orderStatus = orderStatus

    this.offerer = offerer

    this.encodedOrder = encodedOrder
    this.nonce = nonce
    this.orderHash = orderHash

    this.input = input
    this.outputs = outputs

    this.reactor = reactor
    this.decayStartTime = decayStartTime
    this.decayEndTime = decayEndTime
    this.deadline = deadline

    this.filler = filler
    this.quoteId = quoteId
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

  static fromEntity(entity: DutchOrderEntity): DutchV1Order {
    return new DutchV1Order({
      chainId: entity.chainId,
      signature: entity.signature,
      orderStatus: entity.orderStatus,

      offerer: entity.offerer,
      encodedOrder: entity.encodedOrder,

      nonce: BigNumber.from(entity.nonce),
      orderHash: entity.orderHash,

      input: {
        token: entity.input.token,
        startAmount: BigNumber.from(entity.input.startAmount),
        endAmount: BigNumber.from(entity.input.endAmount),
      },
      outputs: entity.outputs.map((output) => ({
        token: output.token,
        startAmount: BigNumber.from(output.startAmount),
        endAmount: BigNumber.from(output.endAmount),
        recipient: output.recipient.toLowerCase(),
      })),

      reactor: entity.reactor,

      decayStartTime: entity.decayStartTime,
      decayEndTime: entity.decayEndTime,
      deadline: entity.deadline,

      filler: entity.filler,

      quoteId: entity.quoteId,
    })
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
    return new DutchV1Order({
      chainId: chainId,
      signature: signature,
      orderStatus: orderStatus,

      offerer: inner.info.swapper.toLowerCase(),
      encodedOrder: inner.serialize(),

      nonce: inner.info.nonce,
      orderHash: inner.hash().toLowerCase(),

      input: inner.info.input,
      outputs: inner.info.outputs,
      reactor: inner.info.reactor.toLowerCase(),

      decayStartTime: inner.info.decayStartTime,
      decayEndTime: inner.info.decayEndTime,
      deadline: inner.info.deadline,

      filler: inner.info?.exclusiveFiller?.toLowerCase(),
      quoteId: quoteId,
    })
  }
}
