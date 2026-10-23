import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
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
  fillTimestamp: number | undefined
  deadline: number
  /** As signed by swapper. A non-zero `cosignerData.inputOverride` replaces `startAmount` at fill. */
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
  /** As signed by swapper. A non-zero `cosignerData.outputOverrides[i]` replaces `startAmount` at fill. */
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
  /**
   * `input` with the override applied: what the filler receives. `curve` and
   * `adjustmentPerGweiBaseFee` still apply. Always set for Dutch V3; optional for the
   * legacy untyped response.
   */
  effectiveInput?: {
    token: string
    startAmount: string
    curve: {
      relativeBlocks: number[]
      relativeAmounts: string[]
    }
    maxAmount: string
    adjustmentPerGweiBaseFee: string
  }
  /**
   * `outputs` with the overrides applied: what the filler pays. `curve` and
   * `adjustmentPerGweiBaseFee` still apply, plus `cosignerData.exclusivityOverrideBps` for
   * a non-exclusive filler. Always set for Dutch V3; optional for the legacy untyped response.
   */
  effectiveOutputs?: {
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
}

export const CosignerDataJoi = Joi.object({
  decayStartBlock: Joi.number(),
  exclusiveFiller: FieldValidator.isValidEthAddress(),
  inputOverride: FieldValidator.isValidAmount(),
  outputOverrides: Joi.array().items(FieldValidator.isValidAmount()),
})

const CurveJoi = Joi.object({
  relativeBlocks: Joi.array().items(FieldValidator.isValidNumber()),
  relativeAmounts: Joi.array().items(FieldValidator.isValidBigIntString()),
})

const InputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  curve: CurveJoi,
  maxAmount: FieldValidator.isValidAmount(),
  adjustmentPerGweiBaseFee: FieldValidator.isValidAmount(),
})

const OutputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  curve: CurveJoi,
  recipient: FieldValidator.isValidEthAddress().required(),
  minAmount: FieldValidator.isValidAmount(),
  adjustmentPerGweiBaseFee: FieldValidator.isValidAmount(),
})

export const GetDutchV3OrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  //only Dutch_V3
  type: Joi.string().valid(OrderType.Dutch_V3).required(),
  startingBaseFee: FieldValidator.isValidAmount(),
  input: InputJoi,
  outputs: Joi.array().items(OutputJoi),
  effectiveInput: InputJoi,
  effectiveOutputs: Joi.array().items(OutputJoi),
  cosignerData: CosignerDataJoi,
})
