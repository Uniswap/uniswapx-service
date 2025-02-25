import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'
import { GetDutchV2OrderResponse } from './GetDutchV2OrderResponse'
import { Route } from '../../../repositories/quote-metadata-repository'
import { CommonOrderValidationFields } from './Common'

export type GetPriorityOrderResponse = Omit<GetDutchV2OrderResponse, 'type' | 'input' | 'outputs' | 'cosignerData'> & {
  type: OrderType.Priority
  input: {
    token: string
    amount: string
    mpsPerPriorityFeeWei: string
  }
  outputs: {
    token: string
    amount: string
    mpsPerPriorityFeeWei: string
    recipient: string
  }[]
  cosignerData: {
    auctionTargetBlock: number
  }
  auctionStartBlock: number
  baselinePriorityFeeWei: string
  cosignature: string
  nonce: string
  quoteId: string | undefined
  requestId: string | undefined
  createdAt: number | undefined
  route: Route | undefined
}

export const PriorityCosignerDataJoi = Joi.object({
  auctionTargetBlock: Joi.number(),
})

export const GetPriorityOrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  type: Joi.string().valid(OrderType.Priority).required(),
  input: Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    amount: FieldValidator.isValidAmount().required(),
    mpsPerPriorityFeeWei: FieldValidator.isValidAmount().required(),
  }),
  outputs: Joi.array().items(
    Joi.object({
      token: FieldValidator.isValidEthAddress().required(),
      amount: FieldValidator.isValidAmount().required(),
      mpsPerPriorityFeeWei: FieldValidator.isValidAmount().required(),
      recipient: FieldValidator.isValidEthAddress().required(),
    })
  ),
  auctionStartBlock: Joi.number().min(0),
  baselinePriorityFeeWei: FieldValidator.isValidAmount(),
  cosignerData: PriorityCosignerDataJoi,
})
