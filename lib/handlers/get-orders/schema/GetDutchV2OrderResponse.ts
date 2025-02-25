import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { Route } from '../../../repositories/quote-metadata-repository'
import { CommonOrderValidationFields } from './Common'

export type GetDutchV2OrderResponse = {
  type: OrderType.Dutch_V2
  orderStatus: ORDER_STATUS
  signature: string
  encodedOrder: string

  orderHash: string
  chainId: number
  swapper: string
  reactor: string

  txHash: string | undefined
  deadline: number
  input: {
    token: string
    startAmount: string
    endAmount: string
  }
  outputs: {
    token: string
    startAmount: string
    endAmount: string
    recipient: string
  }[]
  settledAmounts: {
    tokenOut: string
    amountOut: string
    tokenIn: string
    amountIn: string
  }[] | undefined
  cosignerData: {
    decayStartTime: number
    decayEndTime: number
    exclusiveFiller: string
    inputOverride: string
    outputOverrides: string[]
  }
  cosignature: string
  nonce: string
  quoteId: string | undefined
  requestId: string | undefined
  createdAt: number | undefined
  route: Route | undefined
}

export const CosignerDataJoi = Joi.object({
  decayStartTime: Joi.number(),
  decayEndTime: Joi.number(),
  exclusiveFiller: FieldValidator.isValidEthAddress(),
  inputOverride: FieldValidator.isValidAmount(),
  outputOverrides: Joi.array().items(FieldValidator.isValidAmount()),
})

export const GetDutchV2OrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  type: Joi.string().valid(OrderType.Dutch_V2).required(),
  input: Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    startAmount: FieldValidator.isValidAmount().required(),
    endAmount: FieldValidator.isValidAmount().required(),
  }),
  outputs: Joi.array().items(
    Joi.object({
      token: FieldValidator.isValidEthAddress().required(),
      startAmount: FieldValidator.isValidAmount().required(),
      endAmount: FieldValidator.isValidAmount().required(),
      recipient: FieldValidator.isValidEthAddress().required(),
    })
  ),
  cosignerData: CosignerDataJoi,
})
