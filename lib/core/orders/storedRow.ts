import { OrderType } from '@uniswap/uniswapx-sdk'
import { TABLE_KEY } from '../../config/dynamodb'
import { ORDER_STATUS, SettledAmount, UniswapXOrderEntity } from '../../entities'
import { DutchV2Order } from '../../models/DutchV2Order'
import { DutchV3Order } from '../../models/DutchV3Order'
import { LimitOrder } from '../../models/LimitOrder'
import { PriorityOrder } from '../../models/PriorityOrder'

/**
 * The rows this service writes to the shared Orders and LimitOrders tables, built in one place.
 * Every field and quirk here is part of what legacy GSIs, GETs, the tracker and the analytics
 * stream read (pinned by test/integ/contract/fixtures), so a change here is a contract change.
 */

export type PostedOrder = LimitOrder | DutchV2Order | DutchV3Order | PriorityOrder

// The composite keys the tables' GSIs are built on. A status write rewrites the ones that
// include the status.
export type IndexFields = {
  offerer_orderStatus: string
  filler_orderStatus: string
  filler_offerer: string
  chainId_filler: string
  chainId_orderStatus: string
  chainId_orderStatus_filler: string
  filler_offerer_orderStatus: string
}

export type StoredRow = UniswapXOrderEntity & IndexFields & { createdAt: number }

/** The fill details a status write may carry; named as in the backend's OrderStore. */
export type StatusUpdateFill = {
  txHash?: string
  fillBlock?: number
  /** Seconds. */
  fillTimestamp?: number
  settledAmounts?: SettledAmount[]
}

/**
 * The order as the post path hands it to analytics, the immediate filler notice and the store:
 * a new order is always OPEN. A limit order is stored with type Dutch.
 */
export function toOrderEntity(order: PostedOrder): UniswapXOrderEntity {
  const { inner } = order
  const shared = {
    encodedOrder: inner.serialize(),
    signature: order.signature,
    nonce: inner.info.nonce.toString(),
    orderHash: inner.hash().toLowerCase(),
    chainId: inner.chainId,
    orderStatus: ORDER_STATUS.OPEN,
    offerer: inner.info.swapper.toLowerCase(),
    reactor: inner.info.reactor.toLowerCase(),
    deadline: inner.info.deadline,
  }

  if (order instanceof LimitOrder) {
    const { info } = order.inner
    return {
      ...shared,
      type: OrderType.Dutch,
      input: {
        token: info.input.token,
        startAmount: info.input.startAmount.toString(),
        endAmount: info.input.endAmount.toString(),
      },
      outputs: info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient.toLowerCase(),
      })),
      decayStartTime: info.decayStartTime,
      decayEndTime: info.deadline,
      filler: info?.exclusiveFiller?.toLowerCase(),
      ...(order.quoteId && { quoteId: order.quoteId }),
    }
  }

  const cosigned = {
    cosignature: order.inner.info.cosignature,
    quoteId: order.quoteId,
    requestId: order.requestId,
  }

  if (order instanceof DutchV2Order) {
    const { info } = order.inner
    return {
      ...shared,
      ...cosigned,
      type: OrderType.Dutch_V2,
      input: {
        token: info.input.token,
        startAmount: info.input.startAmount.toString(),
        endAmount: info.input.endAmount.toString(),
      },
      outputs: info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient.toLowerCase(),
      })),
      decayStartTime: info.cosignerData.decayStartTime,
      decayEndTime: info.cosignerData.decayEndTime,
      filler: info?.cosignerData?.exclusiveFiller.toLowerCase(),
      cosignerData: {
        decayStartTime: info.cosignerData.decayStartTime,
        decayEndTime: info.cosignerData.decayEndTime,
        exclusiveFiller: info.cosignerData.exclusiveFiller,
        inputOverride: info.cosignerData.inputOverride.toString(),
        outputOverrides: info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
    }
  }

  if (order instanceof DutchV3Order) {
    const { info } = order.inner
    return {
      ...shared,
      ...cosigned,
      type: OrderType.Dutch_V3,
      startingBaseFee: info.startingBaseFee.toString(),
      input: {
        token: info.input.token,
        startAmount: info.input.startAmount.toString(),
        curve: {
          relativeBlocks: info.input.curve.relativeBlocks,
          relativeAmounts: info.input.curve.relativeAmounts.map((a) => a.toString()),
        },
        maxAmount: info.input.maxAmount.toString(),
        adjustmentPerGweiBaseFee: info.input.adjustmentPerGweiBaseFee.toString(),
      },
      outputs: info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        curve: {
          relativeBlocks: output.curve.relativeBlocks,
          relativeAmounts: output.curve.relativeAmounts.map((a) => a.toString()),
        },
        minAmount: output.minAmount.toString(),
        recipient: output.recipient.toLowerCase(),
        adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee.toString(),
      })),
      filler: info?.cosignerData?.exclusiveFiller.toLowerCase(),
      cosignerData: {
        decayStartBlock: info.cosignerData.decayStartBlock,
        exclusiveFiller: info.cosignerData.exclusiveFiller,
        inputOverride: info.cosignerData.inputOverride.toString(),
        outputOverrides: info.cosignerData.outputOverrides.map((o) => o.toString()),
      },
    }
  }

  // Priority orders have no exclusive filler, so their filler-keyed index fields read 'undefined_*'.
  const { info } = order.inner
  return {
    ...shared,
    ...cosigned,
    type: OrderType.Priority,
    auctionStartBlock: info.auctionStartBlock.toNumber(),
    baselinePriorityFeeWei: info.baselinePriorityFeeWei.toString(),
    input: {
      token: info.input.token,
      amount: info.input.amount.toString(),
      mpsPerPriorityFeeWei: info.input.mpsPerPriorityFeeWei.toString(),
    },
    outputs: info.outputs.map((output) => ({
      token: output.token,
      amount: output.amount.toString(),
      mpsPerPriorityFeeWei: output.mpsPerPriorityFeeWei.toString(),
      recipient: output.recipient.toLowerCase(),
    })),
    cosignerData: {
      auctionTargetBlock: info.cosignerData.auctionTargetBlock.toNumber(),
    },
  }
}

/** The row the post path puts: the entity, its index fields, and createdAt in seconds. */
export function toStoredRow(entity: UniswapXOrderEntity, nowSeconds: number): StoredRow {
  const { offerer, orderStatus, filler, chainId } = entity
  return {
    ...entity,
    offerer_orderStatus: `${offerer}_${orderStatus}`,
    filler_orderStatus: `${filler}_${orderStatus}`,
    filler_offerer: `${filler}_${offerer}`,
    chainId_filler: `${chainId}_${filler}`,
    chainId_orderStatus: `${chainId}_${orderStatus}`,
    chainId_orderStatus_filler: `${chainId}_${orderStatus}_${filler}`,
    filler_offerer_orderStatus: `${filler}_${offerer}_${orderStatus}`,
    createdAt: nowSeconds,
  }
}

/**
 * The attributes a status write sets on `row`: the new status, the index fields that include it,
 * and the fill details that are set and non-zero (an empty txHash or a fillBlock of 0 leaves the
 * stored value as it was).
 */
export function toStatusUpdate(row: UniswapXOrderEntity, status: ORDER_STATUS, fill: StatusUpdateFill = {}) {
  const { offerer, filler, chainId } = row
  const { txHash, fillBlock, fillTimestamp, settledAmounts } = fill
  return {
    [TABLE_KEY.ORDER_HASH]: row.orderHash,
    orderStatus: status,
    offerer_orderStatus: `${offerer}_${status}`,
    filler_orderStatus: `${filler}_${status}`,
    filler_offerer_orderStatus: `${filler}_${offerer}_${status}`,
    chainId_orderStatus: `${chainId}_${status}`,
    chainId_orderStatus_filler: `${chainId}_${status}_${filler}`,
    ...(txHash && { txHash }),
    ...(fillBlock && { fillBlock }),
    ...(fillTimestamp && { fillTimestamp }),
    ...(settledAmounts && { settledAmounts }),
  }
}
