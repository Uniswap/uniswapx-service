import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../entities'
import { RelayOrder } from '../../../models'

export type GetRelayOrderResponse = {
  type: OrderType.Relay
  orderStatus: ORDER_STATUS
  signature: string
  encodedOrder: string

  orderHash: string
  chainId: number
  swapper: string
  reactor: string

  deadline: number
  input: {
    token: string
    amount: string
    recipient: string
  }
  relayFee: {
    token: string
    startAmount: string
    endAmount: string
    startTime: number
    endTime: number
  }
}

export function mapRelayOrderModelToGetResponse(order: RelayOrder): GetRelayOrderResponse {
  return {
    type: OrderType.Relay,
    orderStatus: order.orderStatus as ORDER_STATUS,
    signature: order.signature,
    encodedOrder: order.inner.serialize(),
    chainId: order.chainId,

    orderHash: order.inner.hash(),
    swapper: order.inner.info.swapper,
    reactor: order.inner.info.reactor,
    deadline: order.inner.info.deadline,
    input: {
      token: order.inner.info.input.token,
      amount: order.inner.info.input.amount.toString(),
      recipient: order.inner.info.input.recipient,
    },
    relayFee: {
      token: order.inner.info.fee.token,
      startAmount: order.inner.info.fee.startAmount.toString(),
      endAmount: order.inner.info.fee.endAmount.toString(),
      startTime: order.inner.info.fee.startTime,
      endTime: order.inner.info.fee.endTime,
    },
  }
}
