import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
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
  fillBlock: number | undefined
  fillTimestamp: number | undefined
  deadline: number
  /** As signed by swapper. A non-zero `cosignerData.inputOverride` replaces `startAmount` at fill. */
  input: {
    token: string
    startAmount: string
    endAmount: string
  }
  /** As signed by swapper. A non-zero `cosignerData.outputOverrides[i]` replaces `startAmount` at fill. */
  outputs: {
    token: string
    startAmount: string
    endAmount: string
    recipient: string
  }[]
  /**
   * `input` with the override applied: what the filler receives. Still decays to
   * `endAmount`. Always set for Dutch V2; optional for the legacy untyped response.
   */
  effectiveInput?: {
    token: string
    startAmount: string
    endAmount: string
  }
  /**
   * `outputs` with the overrides applied: what the filler pays. Still decays to
   * `endAmount`, plus `cosignerData.exclusivityOverrideBps` for a non-exclusive filler.
   * Always set for Dutch V2; optional for the legacy untyped response.
   */
  effectiveOutputs?: {
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
}

export const CosignerDataJoi = Joi.object({
  decayStartTime: Joi.number(),
  decayEndTime: Joi.number(),
  exclusiveFiller: FieldValidator.isValidEthAddress(),
  inputOverride: FieldValidator.isValidAmount(),
  outputOverrides: Joi.array().items(FieldValidator.isValidAmount()),
})

const InputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  endAmount: FieldValidator.isValidAmount().required(),
})

const OutputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  endAmount: FieldValidator.isValidAmount().required(),
  recipient: FieldValidator.isValidEthAddress().required(),
})

export const GetDutchV2OrderResponseEntryJoi = Joi.object({
  ...CommonOrderValidationFields,
  type: Joi.string().valid(OrderType.Dutch_V2).required(),
  input: InputJoi,
  outputs: Joi.array().items(OutputJoi),
  effectiveInput: InputJoi,
  effectiveOutputs: Joi.array().items(OutputJoi),
  cosignerData: CosignerDataJoi,
})
