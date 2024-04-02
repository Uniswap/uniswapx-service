import Joi from 'joi'
import { UniswapXOrderEntity } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { GetRelayOrderResponse } from './GetRelayOrderResponse'

export type GetOrdersResponse<T extends UniswapXOrderEntity | GetRelayOrderResponse | undefined> = {
  orders: T[]
  cursor?: string
}

export const OrderInputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount(),
  endAmount: FieldValidator.isValidAmount(),
})

export const CosignerDataJoi = Joi.object({
  decayStartTime: Joi.number(),
  decayEndTime: Joi.number(),
  exclusiveFiller: FieldValidator.isValidEthAddress(),
  inputOverride: FieldValidator.isValidAmount(),
  outputOverrides: Joi.array().items(FieldValidator.isValidAmount()),
})

export const OrderOutputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount().required(),
  endAmount: FieldValidator.isValidAmount().required(),
  recipient: FieldValidator.isValidEthAddress().required(),
})

export const SettledAmount = Joi.object({
  tokenOut: FieldValidator.isValidEthAddress(),
  amountOut: FieldValidator.isValidAmount(),
  tokenIn: FieldValidator.isValidEthAddress(),
  amountIn: FieldValidator.isValidAmount(),
})
const OrderRepsonseEntryJoiMigrations = {
  chainId: FieldValidator.isValidChainId().valid(12341234),
}

export const OrderResponseEntryJoi = Joi.object({
  createdAt: FieldValidator.isValidCreatedAt(),
  encodedOrder: FieldValidator.isValidEncodedOrder(),
  signature: FieldValidator.isValidSignature(),
  orderStatus: FieldValidator.isValidOrderStatus(),
  orderHash: FieldValidator.isValidOrderHash(),
  swapper: FieldValidator.isValidEthAddress(),
  txHash: FieldValidator.isValidTxHash(),
  type: FieldValidator.isValidOrderType(),
  input: OrderInputJoi,
  outputs: Joi.array().items(OrderOutputJoi),
  settledAmounts: Joi.array().items(SettledAmount),
  chainId: FieldValidator.isValidChainId(),
  quoteId: FieldValidator.isValidQuoteId(),
  //only for dutch_v2
  cosignerData: CosignerDataJoi,
  cosignature: Joi.string(),
}).keys({
  ...OrderRepsonseEntryJoiMigrations,
})

export const GetOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(OrderResponseEntryJoi),
  cursor: FieldValidator.isValidCursor(),
})
