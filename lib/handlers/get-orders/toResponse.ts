import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  NonlinearDutchDecay,
  OrderType,
} from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { UniswapXOrderEntity } from '../../entities'
import { GetDutchV2OrderResponse } from './schema/GetDutchV2OrderResponse'
import { GetDutchV3OrderResponse } from './schema/GetDutchV3OrderResponse'
import { GetPriorityOrderResponse } from './schema/GetPriorityOrderResponse'

/**
 * The GET /orders body entry for each cosigned order type. The order fields come from the stored
 * encodedOrder, re-parsed (so recipients come back checksummed, where the row stores them
 * lowercased); status and fill details come from the row. Key order is part of the response
 * bytes (pinned by test/integ/contract/fixtures/read-orders.ts).
 */

type CosignedOrder = CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder

function head<T extends OrderType>(type: T, inner: CosignedOrder, entity: UniswapXOrderEntity) {
  return {
    type,
    orderStatus: entity.orderStatus,
    signature: entity.signature,
    encodedOrder: inner.serialize(),
    chainId: entity.chainId,
    nonce: inner.info.nonce.toString(),
    txHash: entity.txHash,
    fillBlock: entity.fillBlock,
    fillTimestamp: entity.fillTimestamp,
    orderHash: inner.hash(),
    swapper: inner.info.swapper,
    reactor: inner.info.reactor,
    deadline: inner.info.deadline,
  }
}

function tail(inner: CosignedOrder, entity: UniswapXOrderEntity) {
  return {
    cosignature: inner.info.cosignature,
    quoteId: entity.quoteId,
    requestId: entity.requestId,
    createdAt: entity.createdAt,
  }
}

// Mirrors the V2/V3 reactors' _updateWithCosignerAmounts: a non-zero override replaces startAmount.
function overridden(startAmount: BigNumber, override: BigNumber | undefined): BigNumber {
  return override && !override.isZero() ? override : startAmount
}

function curve({ relativeBlocks, relativeAmounts }: NonlinearDutchDecay) {
  return { relativeBlocks, relativeAmounts: relativeAmounts.map((a) => a.toString()) }
}

export function toV2Response(entity: UniswapXOrderEntity): GetDutchV2OrderResponse {
  const inner = CosignedV2DutchOrder.parse(entity.encodedOrder, entity.chainId)
  const { input, outputs, cosignerData } = inner.info
  // endAmount is not overridable.
  const toInput = (startAmount: BigNumber) => ({
    token: input.token,
    startAmount: startAmount.toString(),
    endAmount: input.endAmount.toString(),
  })
  const toOutputs = (overrides: BigNumber[]) =>
    outputs.map((o, i) => ({
      token: o.token,
      startAmount: overridden(o.startAmount, overrides[i]).toString(),
      endAmount: o.endAmount.toString(),
      recipient: o.recipient,
    }))

  return {
    ...head(OrderType.Dutch_V2, inner, entity),
    input: toInput(input.startAmount),
    outputs: toOutputs([]),
    effectiveInput: toInput(overridden(input.startAmount, cosignerData.inputOverride)),
    effectiveOutputs: toOutputs(cosignerData.outputOverrides),
    settledAmounts: entity.settledAmounts,
    cosignerData: {
      decayStartTime: cosignerData.decayStartTime,
      decayEndTime: cosignerData.decayEndTime,
      exclusiveFiller: cosignerData.exclusiveFiller,
      inputOverride: cosignerData.inputOverride.toString(),
      outputOverrides: cosignerData.outputOverrides.map((o) => o.toString()),
    },
    ...tail(inner, entity),
  }
}

export function toV3Response(entity: UniswapXOrderEntity): GetDutchV3OrderResponse {
  const inner = CosignedV3DutchOrder.parse(entity.encodedOrder, entity.chainId)
  const { input, outputs, cosignerData } = inner.info
  // The curve and min/max bounds are not overridable.
  const toInput = (startAmount: BigNumber) => ({
    token: input.token,
    startAmount: startAmount.toString(),
    curve: curve(input.curve),
    maxAmount: input.maxAmount.toString(),
    adjustmentPerGweiBaseFee: input.adjustmentPerGweiBaseFee.toString(),
  })
  const toOutputs = (overrides: BigNumber[]) =>
    outputs.map((o, i) => ({
      token: o.token,
      startAmount: overridden(o.startAmount, overrides[i]).toString(),
      curve: curve(o.curve),
      minAmount: o.minAmount.toString(),
      recipient: o.recipient,
      adjustmentPerGweiBaseFee: o.adjustmentPerGweiBaseFee.toString(),
    }))

  return {
    ...head(OrderType.Dutch_V3, inner, entity),
    startingBaseFee: inner.info.startingBaseFee.toString(),
    input: toInput(input.startAmount),
    outputs: toOutputs([]),
    effectiveInput: toInput(overridden(input.startAmount, cosignerData.inputOverride)),
    effectiveOutputs: toOutputs(cosignerData.outputOverrides),
    settledAmounts: entity.settledAmounts,
    cosignerData: {
      decayStartBlock: cosignerData.decayStartBlock,
      exclusiveFiller: cosignerData.exclusiveFiller,
      inputOverride: cosignerData.inputOverride.toString(),
      outputOverrides: cosignerData.outputOverrides.map((o) => o.toString()),
    },
    ...tail(inner, entity),
  }
}

export function toPriorityResponse(entity: UniswapXOrderEntity): GetPriorityOrderResponse {
  const inner = CosignedPriorityOrder.parse(entity.encodedOrder, entity.chainId)
  const { input, outputs } = inner.info
  return {
    ...head(OrderType.Priority, inner, entity),
    auctionStartBlock: inner.info.auctionStartBlock.toNumber(),
    baselinePriorityFeeWei: inner.info.baselinePriorityFeeWei.toString(),
    input: {
      token: input.token,
      amount: input.amount.toString(),
      mpsPerPriorityFeeWei: input.mpsPerPriorityFeeWei.toString(),
    },
    // Every output repeats the input's amount and mpsPerPriorityFeeWei rather than its own. Wrong,
    // but what GET has always returned; kept for parity.
    outputs: outputs.map((o) => ({
      token: o.token,
      amount: input.amount.toString(),
      mpsPerPriorityFeeWei: input.mpsPerPriorityFeeWei.toString(),
      recipient: o.recipient,
    })),
    settledAmounts: entity.settledAmounts,
    cosignerData: {
      auctionTargetBlock: inner.info.cosignerData.auctionTargetBlock.toNumber(),
    },
    ...tail(inner, entity),
  }
}
