import { OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber, ethers } from 'ethers'
import Joi, { CustomHelpers } from 'joi'
import FieldValidator from '../../../util/field-validator'
import { ORDER_STATUS } from '../../../entities'
import { Route } from '../../../repositories/quote-metadata-repository'
import { CommonOrderValidationFields } from './Common'

// Validates that all elements in a price curve are on the same side of 1e18
// (all >= 1e18 or all <= 1e18, but not a mix)
const priceCurveValidator = Joi.array()
  .items(FieldValidator.isValidAmount())
  .custom((values: string[], helpers: CustomHelpers<string[]>) => {
    if (!values || values.length === 0) {
      return values
    }

    let hasAbove = false
    let hasBelow = false

    for (const value of values) {
      const bn = BigNumber.from(value)
      if (bn.gt(ethers.constants.WeiPerEther)) {
        hasAbove = true
      } else if (bn.lt(ethers.constants.WeiPerEther)) {
        hasBelow = true
      }

      // Values equal to 1e18 are neutral and don't affect either side
      if (hasAbove && hasBelow) {
        return helpers.error('any.invalid', {
          message: 'priceCurve elements must all be on the same side of 1e18',
        })
      }
    }

    return values
  }, 'price curve same side validation')

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
  supplementalPriceCurve: priceCurveValidator,
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
  priceCurve: priceCurveValidator,
  cosigner: FieldValidator.isValidEthAddress(),
  cosignerData: HybridCosignerDataJoi,
})

