import { ORDER_STATUS } from '../../types/order'

export type StateInput = {
  startBlockNumber: number
  encodedOrder: string
  signature: string
  chainId: number
  prevCheckOrderOutput: StateOutput
  orderHash: string
}
export type Payload = {
  prevBlockNumber: number
  orderStatus: ORDER_STATUS
  orderStatusChanged: boolean
}
export type StateOutput = {
  Payload: Payload
}
