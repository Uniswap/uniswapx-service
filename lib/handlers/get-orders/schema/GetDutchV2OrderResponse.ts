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
  /**
   * `input`/`outputs` are the amounts the swapper signed. The cosigner can improve them,
   * and the reactor uses the override in place of `startAmount` whenever it is non-zero,
   * so neither field on its own is what a fill actually moves. `effectiveInput` and
   * `effectiveOutputs` are those same amounts with `cosignerData.inputOverride` and
   * `cosignerData.outputOverrides` already applied: what the filler receives and pays.
   *
   * Always populated for Dutch V2 orders. Optional so older clients and the legacy
   * untyped `GET /orders` response stay valid. Amounts still decay to `endAmount` over
   * the cosigner's decay window, and a non-exclusive filler pays
   * `cosignerData.exclusivityOverrideBps` on top of every output.
   */
  effectiveInput?: {
    token: string
    startAmount: string
    endAmount: string
  }
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
  route: Route | undefined
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
