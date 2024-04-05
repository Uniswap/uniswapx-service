import { OrderType, RelayOrder as SDKRelayOrder } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, RelayOrderEntity } from '../entities'
import { GetRelayOrderResponse } from '../handlers/get-orders/schema/GetRelayOrderResponse'
import { Order } from './Order'

export class RelayOrder extends Order {
  constructor(
    readonly inner: SDKRelayOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly orderStatus?: ORDER_STATUS
  ) {
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

  public static fromEntity(entity: RelayOrderEntity) {
    return new RelayOrder(
      SDKRelayOrder.parse(entity.encodedOrder, entity.chainId),
      entity.signature,
      entity.chainId,
      entity.orderStatus
    )
  }

  public toGetResponse(): GetRelayOrderResponse {
    return {
      type: OrderType.Relay,
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
        amount: this.inner.info.input.amount.toString(),
        recipient: this.inner.info.input.recipient,
      },
      relayFee: {
        token: this.inner.info.fee.token,
        startAmount: this.inner.info.fee.startAmount.toString(),
        endAmount: this.inner.info.fee.endAmount.toString(),
        startTime: this.inner.info.fee.startTime,
        endTime: this.inner.info.fee.endTime,
      },
    }
  }
}
