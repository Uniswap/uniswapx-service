import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, SettledAmount } from './Order'

export type RelayOrderEntity = {
  type: OrderType.Relay
  orderStatus: ORDER_STATUS
  signature: string
  encodedOrder: string

  nonce: string
  orderHash: string
  chainId: number
  offerer: string
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

  createdAt?: number
  // Filler field is defined when the order has been filled and the status tracking function has recorded the filler address.
  filler?: string
  // QuoteId field is defined when the order has a quote associated with it.
  quoteId?: string
  // TxHash field is defined when the order has been filled and there is a txHash associated with the fill.
  txHash?: string
  // SettledAmount field is defined when the order has been filled and the fill amounts have been recorded.
  settledAmounts?: SettledAmount[]
}
