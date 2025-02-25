import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { Route } from '../../../repositories/quote-metadata-repository'
import { CommonOrderValidationFields } from './Common'

export type GetDutchV3OrderResponse = {
  type: OrderType.Dutch_V3
  orderStatus: ORDER_STATUS
  signature: string
  encodedOrder: string

  orderHash: string
  chainId: number
  swapper: string
  reactor: string

  txHash: string | undefined
  fillBlock: number | undefined
  deadline: number
  input: {
    token: string
    startAmount: string
    curve: {
      relativeBlocks: number[]
      relativeAmounts: string[]
    }
    maxAmount: string
    adjustmentPerGweiBaseFee: string
  }
  outputs: {
    token: string
    startAmount: string
    curve: {
      relativeBlocks: number[]
      relativeAmounts: string[]
    }
    recipient: string
    minAmount: string
    adjustmentPerGweiBaseFee: string
  }[]
  settledAmounts: {
    tokenOut: string
    amountOut: string
    tokenIn: string
    amountIn: string
  }[] | undefined
  startingBaseFee: string
  cosignerData: {
    decayStartBlock: number
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
  decayStartBlock: Joi.number(),
  exclusiveFiller: FieldValidator.isValidEthAddress(),
  inputOverride: FieldValidator.isValidAmount(),
  outputOverrides: Joi.array().items(FieldValidator.isValidAmount()),
})

export const GetDutchV3OrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  //only Dutch_V3
  type: Joi.string().valid(OrderType.Dutch_V3).required(),
  startingBaseFee: FieldValidator.isValidAmount(),
  fillBlock: FieldValidator.isValidNumber(),
  input: Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    startAmount: FieldValidator.isValidAmount().required(),
    curve: Joi.object({
      relativeBlocks: Joi.array().items(FieldValidator.isValidNumber()),
      relativeAmounts: Joi.array().items(FieldValidator.isValidAmount()),
    }),
    maxAmount: FieldValidator.isValidAmount(),
    adjustmentPerGweiBaseFee: FieldValidator.isValidAmount(),
  }),
  outputs: Joi.array().items(
    Joi.object({
      token: FieldValidator.isValidEthAddress().required(),
      startAmount: FieldValidator.isValidAmount().required(),
      curve: Joi.object({
        relativeBlocks: Joi.array().items(FieldValidator.isValidNumber()),
        relativeAmounts: Joi.array().items(FieldValidator.isValidAmount()),
      }),
      recipient: FieldValidator.isValidEthAddress().required(),
      minAmount: FieldValidator.isValidAmount(),
      adjustmentPerGweiBaseFee: FieldValidator.isValidAmount(),
    })
  ),
  cosignerData: CosignerDataJoi,
})
