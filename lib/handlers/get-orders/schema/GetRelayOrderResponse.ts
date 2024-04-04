import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { SettledAmount } from './GetOrdersResponse'

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

export const RelayOrderResponseEntryJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(),
  signature: FieldValidator.isValidSignature().required(),
  chainId: FieldValidator.isValidChainId().required(),
  orderStatus: FieldValidator.isValidOrderStatus().required(),
  orderHash: FieldValidator.isValidOrderHash().required(),
  swapper: FieldValidator.isValidEthAddress().required(),
  //apply to only relay
  type: Joi.string().valid(OrderType.Relay).required(),

  createdAt: FieldValidator.isValidCreatedAt(),
  txHash: FieldValidator.isValidTxHash(),
  input: {
    token: FieldValidator.isValidEthAddress(),
    amount: FieldValidator.isValidAmount(),
    recipient: FieldValidator.isValidEthAddress(),
  },
  relayFee: {
    token: FieldValidator.isValidEthAddress(),
    startAmount: FieldValidator.isValidAmount(),
    endAmount: FieldValidator.isValidAmount(),
    startTime: Joi.number(),
    endTime: Joi.number(),
  },

  settledAmounts: Joi.array().items(SettledAmount),
})

export const GetRelayOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(RelayOrderResponseEntryJoi),
  cursor: FieldValidator.isValidCursor(),
})
