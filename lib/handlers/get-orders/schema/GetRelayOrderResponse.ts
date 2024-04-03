import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../entities'

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
