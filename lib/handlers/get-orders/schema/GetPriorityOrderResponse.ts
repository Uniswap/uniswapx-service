import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import FieldValidator from '../../../util/field-validator'
import { GetDutchV2OrderResponse } from './GetDutchV2OrderResponse'

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
  cosignature: string
  nonce: string
  quoteId: string | undefined
  requestId: string | undefined
  createdAt: number | undefined
}

export const PriorityCosignerDataJoi = Joi.object({
  auctionTargetBlock: Joi.number(),
})

export const GetPriorityOrderResponseEntryJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(),
  signature: FieldValidator.isValidSignature().required(),
  orderStatus: FieldValidator.isValidOrderStatus().required(),
  orderHash: FieldValidator.isValidOrderHash().required(),
  swapper: FieldValidator.isValidEthAddress().required(),
  //only Dutch_V2
  type: Joi.string().valid(OrderType.Priority).required(),
  chainId: FieldValidator.isValidChainId().required(),

  txHash: FieldValidator.isValidTxHash(),
  input: Joi.object({
    token: FieldValidator.isValidEthAddress().required(),
    amount: FieldValidator.isValidAmount().required(),
    mpsPerPriorityFeeWei: Joi.number().min(0).required(),
  }),
  outputs: Joi.array().items(
    Joi.object({
      token: FieldValidator.isValidEthAddress().required(),
      amount: FieldValidator.isValidAmount().required(),
      mpsPerPriorityFeeWei: Joi.number().min(0).required(),
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
  cosignerData: PriorityCosignerDataJoi,
  cosignature: Joi.string(),
  createdAt: Joi.number(),
})
