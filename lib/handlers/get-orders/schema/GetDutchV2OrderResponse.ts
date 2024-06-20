import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../../entities'
import FieldValidator from '../../../util/field-validator'

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

export const GetDutchV2OrderResponseEntryJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(),
  signature: FieldValidator.isValidSignature().required(),
  orderStatus: FieldValidator.isValidOrderStatus().required(),
  orderHash: FieldValidator.isValidOrderHash().required(),
  swapper: FieldValidator.isValidEthAddress().required(),
  //only Dutch_V2
  type: Joi.string().valid(OrderType.Dutch_V2).required(),
  chainId: FieldValidator.isValidChainId().required(),

  txHash: FieldValidator.isValidTxHash(),
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
  settledAmounts: Joi.array().items(
    Joi.object({
      tokenOut: FieldValidator.isValidEthAddress(),
      amountOut: FieldValidator.isValidAmount(),
      tokenIn: FieldValidator.isValidEthAddress(),
      amountIn: FieldValidator.isValidAmount(),
    })
  ),
  quoteId: FieldValidator.isValidQuoteId(),
  requestId: FieldValidator.isValidRequestId(),
  nonce: FieldValidator.isValidNonce(),
  cosignerData: CosignerDataJoi,
  cosignature: Joi.string(),
  createdAt: Joi.number(),
})
