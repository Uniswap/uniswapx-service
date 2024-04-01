import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, RelayOrderEntity } from '../entities'
import { Order } from './Order'

export class RelayOrder extends Order {
  constructor(readonly inner: SDKRelayOrder, readonly signature: string, readonly chainId: number) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Relay
  }

  public toEntity(orderStatus: ORDER_STATUS): RelayOrderEntity {
    const { input } = this.inner.info
    const decodedOrder = this.inner
    const order: RelayOrderEntity = {
      type: OrderType.Relay,
      encodedOrder: decodedOrder.serialize(),
      signature: this.signature,
      nonce: decodedOrder.info.nonce.toString(),
      orderHash: decodedOrder.hash().toLowerCase(),
      chainId: decodedOrder.chainId,
      orderStatus: orderStatus,
      offerer: decodedOrder.info.swapper.toLowerCase(),
      input: {
        token: input.token,
        amount: input.amount.toString(),
        recipient: input.recipient.toString(),
      },
      relayFee: {
        token: decodedOrder.info.fee.token,
        startAmount: decodedOrder.info.fee.startAmount.toString(),
        endAmount: decodedOrder.info.fee.endAmount.toString(),
        startTime: decodedOrder.info.fee.startTime,
        endTime: decodedOrder.info.fee.endTime,
      },
      reactor: decodedOrder.info.reactor.toLowerCase(),
      deadline: decodedOrder.info.deadline,
    }

    return order
  }
}
