import { DutchOrder as SDKDutchOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'
import { Order } from './Order'

export class LimitOrder extends Order {
  constructor(
    readonly inner: SDKDutchOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string,
    readonly requestId?: string
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Limit
  }

  public toEntity(orderStatus: ORDER_STATUS): UniswapXOrderEntity {
    const { input, outputs } = this.inner.info
    const decodedOrder = this.inner
    const order: UniswapXOrderEntity = {
      type: OrderType.Dutch,
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
      decayStartTime: decodedOrder.info.decayStartTime,
      decayEndTime: decodedOrder.info.deadline,
      deadline: decodedOrder.info.deadline,
      filler: decodedOrder.info?.exclusiveFiller.toLowerCase(),
    }

    return order
  }
}
