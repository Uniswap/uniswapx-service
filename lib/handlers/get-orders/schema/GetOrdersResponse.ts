import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { UniswapXOrderEntity } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { DUTCH_LIMIT } from '../../../util/order'
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
  //exclude relay
  type: Joi.string().valid(OrderType.Dutch, DUTCH_LIMIT, OrderType.Dutch_V2, OrderType.Limit),
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

export const RelayOrderResponseEntryJoi = Joi.object({
  encodedOrder: FieldValidator.isValidEncodedOrder().required(),
  signature: FieldValidator.isValidSignature().required(),
  chainId: FieldValidator.isValidChainId().required(),
  orderStatus: FieldValidator.isValidOrderStatus().required(),
  orderHash: FieldValidator.isValidOrderHash().required(),
  swapper: FieldValidator.isValidEthAddress().required(),
  //apply to only relay
  type: Joi.string().valid(OrderType.Relay).required(),

  createdAt: FieldValidator.isValidCreatedAt(),
  txHash: FieldValidator.isValidTxHash(),
  input: {
    token: FieldValidator.isValidEthAddress(),
    amount: FieldValidator.isValidAmount(),
    recipient: FieldValidator.isValidEthAddress(),
  },
  relayFee: {
    token: FieldValidator.isValidEthAddress(),
    startAmount: FieldValidator.isValidAmount(),
    endAmount: FieldValidator.isValidAmount(),
    startTime: Joi.number(),
    endTime: Joi.number(),
  },

  settledAmounts: Joi.array().items(SettledAmount),
})

export const GetRelayOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(RelayOrderResponseEntryJoi),
  cursor: FieldValidator.isValidCursor(),
})
