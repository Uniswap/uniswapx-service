import { OrderType } from '@uniswap/uniswapx-sdk'
import Joi from 'joi'
import { UniswapXOrderEntity } from '../../../entities'
import FieldValidator from '../../../util/field-validator'
import { DUTCH_LIMIT } from '../../../util/order'
import { GetDutchV2OrderResponse, GetDutchV2OrderResponseEntryJoi } from './GetDutchV2OrderResponse'
import { GetPriorityOrderResponse, GetPriorityOrderResponseEntryJoi } from './GetPriorityOrderResponse'
import { GetRelayOrderResponse } from './GetRelayOrderResponse'
import { GetDutchV3OrderResponse, GetDutchV3OrderResponseEntryJoi } from './GetDutchV3OrderResponse'

export type GetOrdersResponse<
  T extends
    | UniswapXOrderEntity
    | GetRelayOrderResponse
    | GetDutchV2OrderResponse
    | GetDutchV3OrderResponse
    | GetPriorityOrderResponse
    | undefined
> = {
  orders: T[]
  cursor?: string
}

export const OrderInputJoi = Joi.object({
  token: FieldValidator.isValidEthAddress().required(),
  startAmount: FieldValidator.isValidAmount(),
  endAmount: FieldValidator.isValidAmount(),
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
  type: Joi.string().valid(OrderType.Dutch, DUTCH_LIMIT, OrderType.Limit, OrderType.Priority, OrderType.Dutch_V3),
  input: OrderInputJoi,
  outputs: Joi.array().items(OrderOutputJoi),
  settledAmounts: Joi.array().items(SettledAmount),
  chainId: FieldValidator.isValidChainId(),
  quoteId: FieldValidator.isValidQuoteId(),
  requestId: FieldValidator.isValidRequestId(),
  nonce: FieldValidator.isValidNonce(),
}).keys({
  ...OrderRepsonseEntryJoiMigrations,
})

export const GetOrdersResponseJoi = Joi.object({
  orders: Joi.array().items(
    Joi.alternatives(
      OrderResponseEntryJoi,
      GetDutchV2OrderResponseEntryJoi,
      GetDutchV3OrderResponseEntryJoi,
      GetPriorityOrderResponseEntryJoi
    )
  ),
  cursor: FieldValidator.isValidCursor(),
})
