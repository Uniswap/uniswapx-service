import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'
import { ORDER_STATUS } from '../../../entities'
import { Route } from '../../../repositories/quote-metadata-repository'
import { CommonOrderValidationFields } from './Common'

export type GetHybridOrderResponse = {
  type: OrderType.Hybrid
  orderStatus: ORDER_STATUS
  signature: string
  encodedOrder: string

  orderHash: string
  chainId: number
  swapper: string
  reactor: string

  txHash: string | undefined
  deadline: number
  auctionStartBlock: number
  baselinePriorityFee: string
  scalingFactor: string
  input: {
    token: string
    maxAmount: string
  }
  outputs: {
    token: string
    minAmount: string
    recipient: string
  }[]
  settledAmounts: {
    tokenOut: string
    amountOut: string
    tokenIn: string
    amountIn: string
  }[] | undefined
  priceCurve: string[]
  cosigner: string
  cosignerData: {
    auctionTargetBlock: number
    supplementalPriceCurve: string[]
  }
  cosignature: string
  nonce: string
  quoteId: string | undefined
  requestId: string | undefined
  createdAt: number | undefined
  route: Route | undefined
}

export const HybridCosignerDataJoi = Joi.object({
  auctionTargetBlock: Joi.number(),
  supplementalPriceCurve: Joi.array().items(FieldValidator.isValidAmount()),
})

export const GetHybridOrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  type: Joi.string().valid(OrderType.Hybrid).required(),
  input: Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    maxAmount: FieldValidator.isValidAmount().required(),
  }),
  outputs: Joi.array().items(
    Joi.object({
      token: FieldValidator.isValidEthAddress().required(),
      minAmount: FieldValidator.isValidAmount().required(),
      recipient: FieldValidator.isValidEthAddress().required(),
    })
  ),
  auctionStartBlock: Joi.number().min(0),
  baselinePriorityFee: FieldValidator.isValidAmount(),
  scalingFactor: FieldValidator.isValidAmount(),
  priceCurve: Joi.array().items(FieldValidator.isValidAmount()),
  cosigner: FieldValidator.isValidEthAddress(),
  cosignerData: HybridCosignerDataJoi,
})

