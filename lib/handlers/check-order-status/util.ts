import { getAverageBlockTimeSecs } from '@uniswap/sdk-core'
import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  FillInfo,
  OrderType,
  OrderValidator,
  REACTOR_ADDRESS_MAPPING,
  UniswapXEventWatcher,
} from '@uniswap/uniswapx-sdk'

import { BigNumber, ethers } from 'ethers'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { ChainId } from '../../util/chain'
import { NATIVE_ADDRESS, RPC_HEADERS } from '../../util/constants'
import { getRpcUrl } from '../../Config'

export interface FillMetadata {
  timestamp: number
  gasPrice?: BigNumber
  maxPriorityFeePerGas?: BigNumber
  maxFeePerGas?: BigNumber
}

export function getSettledAmounts(
  fill: FillInfo,
  metadata: FillMetadata,
  parsedOrder: DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
) {
  if (parsedOrder instanceof DutchOrder || parsedOrder instanceof CosignedV2DutchOrder) {
    return getDutchSettledAmounts(fill, metadata.timestamp, parsedOrder)
  } else if (parsedOrder instanceof CosignedV3DutchOrder) {
    return getDutchV3SettledAmounts(fill, parsedOrder)
  } else if (parsedOrder instanceof CosignedPriorityOrder) {
    return getPrioritySettledAmounts(fill, metadata, parsedOrder)
  } else {
    throw new Error('Unsupported order type to get settled amounts')
  }
}

export function getPrioritySettledAmounts(
  fill: FillInfo,
  metadata: FillMetadata,
  parsedOrder: CosignedPriorityOrder
): SettledAmount[] {
  const nativeOutputs = parsedOrder.info.outputs.filter((output) => output.token.toLowerCase() === NATIVE_ADDRESS)
  const settledAmounts: SettledAmount[] = []
  let amountIn: string

  // exact_input
  if (parsedOrder.info.input.mpsPerPriorityFeeWei.eq(0)) {
    amountIn = parsedOrder.info.input.amount.toString()

    // TODO: if legacy tx (non-1559), maxPriorityFeePerGas is probably 0
    const resolvedOrder = parsedOrder.resolve({ priorityFee: metadata.maxPriorityFeePerGas ?? BigNumber.from(0) })
    const resolvedNativeOutputs = resolvedOrder.outputs.filter(
      (output) => output.token.toLowerCase() === NATIVE_ADDRESS
    )
    // Add all the resolved native outputs to the settledAmounts as they are not included in the fill logs.
    resolvedNativeOutputs.forEach((resolvedNativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: resolvedNativeOutput.token,
        amountOut: resolvedNativeOutput.amount.toString(),
      })
    })
  } else {
    // If the order is EXACT_OUTPUT we will have all the ERC20 transfers in the fill logs,
    // only log the amountIn that matches the order input token.

    // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
    const input = fill.inputs.find((input) => input.token.toLowerCase() === parsedOrder.info.input.token.toLowerCase())!
    amountIn = input.amount.toString()

    // Add all the native outputs to the settledAmounts as they are not included in the fill logs.
    // The amount is just output.amount because the order is EXACT_OUTPUT.
    nativeOutputs.forEach((nativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: nativeOutput.token,
        amountOut: nativeOutput.amount.toString(),
      })
    })
  }

  fill.outputs.forEach((output) => {
    settledAmounts.push({
      tokenIn: parsedOrder.info.input.token,
      amountIn,
      tokenOut: output.token,
      amountOut: output.amount.toString(),
    })
  })

  return settledAmounts
}

/**
 * get the ammounts transfered on chain
 * used for logging
 */
export function getDutchV3SettledAmounts(
  fill: FillInfo,
  parsedOrder: CosignedV3DutchOrder
): SettledAmount[] {
  parsedOrder.resolve({currentBlock: fill.blockNumber})
  const nativeOutputs = parsedOrder.info.outputs.filter((output) => output.token.toLowerCase() === NATIVE_ADDRESS)
  const settledAmounts: SettledAmount[] = []
  let amountIn: string

  if (!parsedOrder.info.input.curve || 
    (parsedOrder.info.input.curve.relativeAmounts.length === 1 && 
    parsedOrder.info.input.curve.relativeAmounts[0] === BigInt(0))) {
    // If the order is EXACT_INPUT then the input will not decay and resolves to the startAmount/endAmount.
    amountIn = parsedOrder.info.input.startAmount.toString()

    // Resolve the native outputs using the fill block number and filler address from the fill log.
    // This will give us a minimum resolved amount for native out swaps.
    const resolvedOrder = parsedOrder.resolve({ currentBlock: fill.blockNumber, filler: fill.filler })
    const resolvedNativeOutputs = resolvedOrder.outputs.filter(
      (output) => output.token.toLowerCase() === NATIVE_ADDRESS
    )

    // Add all the resolved native outputs to the settledAmounts as they are not included in the fill logs.
    resolvedNativeOutputs.forEach((resolvedNativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: resolvedNativeOutput.token,
        amountOut: resolvedNativeOutput.amount.toString(),
      })
    })
  } else {
    // If the order is EXACT_OUTPUT we will have all the ERC20 transfers in the fill logs,
    // only log the amountIn that matches the order input token.

    // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
    const input = fill.inputs.find((input) => input.token.toLowerCase() === parsedOrder.info.input.token.toLowerCase())!
    amountIn = input.amount.toString()

    // Add all the native outputs to the settledAmounts as they are not included in the fill logs.
    // The amount is just the startAmount because the order is EXACT_OUTPUT so there is no decay on the outputs.
    nativeOutputs.forEach((nativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: nativeOutput.token,
        amountOut: nativeOutput.startAmount.toString(),
      })
    })
  }

  fill.outputs.forEach((output) => {
    settledAmounts.push({
      tokenIn: parsedOrder.info.input.token,
      amountIn,
      tokenOut: output.token,
      amountOut: output.amount.toString(),
    })
  })

  return settledAmounts
}

/**
 * get the ammounts transfered on chain
 * used for logging
 */
export function getDutchSettledAmounts(
  fill: FillInfo,
  fillTimestamp: number,
  parsedOrder: DutchOrder | CosignedV2DutchOrder
): SettledAmount[] {
  const nativeOutputs = parsedOrder.info.outputs.filter((output) => output.token.toLowerCase() === NATIVE_ADDRESS)
  const settledAmounts: SettledAmount[] = []
  let amountIn: string
  if (parsedOrder.info.input.endAmount.eq(parsedOrder.info.input.startAmount)) {
    // If the order is EXACT_INPUT then the input will not decay and resolves to the startAmount/endAmount.
    amountIn = parsedOrder.info.input.startAmount.toString()

    // Resolve the native outputs using the fill timestamp and filler address from the fill log.
    // This will give us a minimum resolved amount for native out swaps.
    const resolvedOrder = parsedOrder.resolve({ timestamp: fillTimestamp, filler: fill.filler })
    const resolvedNativeOutputs = resolvedOrder.outputs.filter(
      (output) => output.token.toLowerCase() === NATIVE_ADDRESS
    )

    // Add all the resolved native outputs to the settledAmounts as they are not included in the fill logs.
    resolvedNativeOutputs.forEach((resolvedNativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: resolvedNativeOutput.token,
        amountOut: resolvedNativeOutput.amount.toString(),
      })
    })
  } else {
    // If the order is EXACT_OUTPUT we will have all the ERC20 transfers in the fill logs,
    // only log the amountIn that matches the order input token.

    // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
    const input = fill.inputs.find((input) => input.token.toLowerCase() === parsedOrder.info.input.token.toLowerCase())!
    amountIn = input.amount.toString()

    // Add all the native outputs to the settledAmounts as they are not included in the fill logs.
    // The amount is just the startAmount because the order is EXACT_OUTPUT so there is no decay on the outputs.
    nativeOutputs.forEach((nativeOutput) => {
      settledAmounts.push({
        tokenIn: parsedOrder.info.input.token,
        amountIn,
        tokenOut: nativeOutput.token,
        amountOut: nativeOutput.startAmount.toString(),
      })
    })
  }

  fill.outputs.forEach((output) => {
    settledAmounts.push({
      tokenIn: parsedOrder.info.input.token,
      amountIn,
      tokenOut: output.token,
      amountOut: output.amount.toString(),
    })
  })

  return settledAmounts
}

// Re-exports the sdk-core per-chain block time so callers and the
// `calculateDutchRetryWaitSeconds` floor stay correct as chain cadence
// changes. Sub-second values are intentional for accurate block-number
// arithmetic in `timestampToBlockNumber`.
export const AVERAGE_BLOCK_TIME = (chainId: ChainId): number => getAverageBlockTimeSecs(chainId)

// Approximate block number from timestamp
export function timestampToBlockNumber(
  referenceBlock: ethers.providers.Block,
  targetTimestamp: number,
  chainId: ChainId
): number {
  const secondsDifference = targetTimestamp - referenceBlock.timestamp;
  const blockTimeSec = AVERAGE_BLOCK_TIME(chainId);
  const blockDifference = Math.floor(secondsDifference / blockTimeSec);
  return referenceBlock.number + blockDifference;
}

export const IS_TERMINAL_STATE = (state: ORDER_STATUS): boolean => {
  return [ORDER_STATUS.CANCELLED, ORDER_STATUS.FILLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.ERROR].includes(state)
}

export const FILL_EVENT_LOOKBACK_BLOCKS_ON = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 10
    case ChainId.POLYGON:
      return 100
    default:
      return 10
  }
}

/**
 * Fill watcher that looks up one order's fill. The SDK's getFillInfo reads every Fill
 * in the range and fetches a receipt for each in parallel; over the wide ranges a
 * long-lived order searches, that fan-out exhausts file descriptors (EMFILE) and fails
 * the execution. Filtering on the indexed orderHash returns only this order's fill, so
 * at most one receipt is fetched.
 */
export class OrderFillWatcher extends UniswapXEventWatcher {
  async getFillInfoForOrder(orderHash: string, fromBlock: number, toBlock: number): Promise<FillInfo[]> {
    const logs = await this.reactor.queryFilter(this.reactor.filters.Fill(orderHash), fromBlock, toBlock)
    return Promise.all(
      logs.map(async (log) => {
        const receipt = await this.reactor.provider.getTransactionReceipt(log.transactionHash)
        return {
          orderHash: log.args.orderHash,
          swapper: log.args.swapper,
          filler: log.args.filler,
          nonce: log.args.nonce,
          blockNumber: receipt.blockNumber,
          txHash: receipt.transactionHash,
          inputs: this.getTokenTransfers(receipt.logs, log.args.filler),
          outputs: this.getTokenTransfers(receipt.logs, log.args.swapper),
        }
      })
    )
  }
}

const watcherMap = new Map<string, OrderFillWatcher>()
export function getWatcher(
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number,
  orderType: OrderType
): OrderFillWatcher {
  const reactorType = orderType === OrderType.Limit ? OrderType.Dutch : orderType
  const address = REACTOR_ADDRESS_MAPPING[chainId]?.[reactorType]
  if (!address) {
    throw new Error(`No Reactor Address Defined in UniswapX SDK for chainId:${chainId}, orderType:${reactorType}`)
  }
  const mapKey = `${chainId}-${reactorType}`
  let watcher = watcherMap.get(mapKey)
  if (!watcher) {
    watcher = new OrderFillWatcher(provider, address)
    watcherMap.set(mapKey, watcher)
  }
  return watcher
}

const providersMap = new Map<number, ethers.providers.StaticJsonRpcProvider>()
export function getProvider(chainId: number): ethers.providers.StaticJsonRpcProvider {
  if (!providersMap.get(chainId)) {
    providersMap.set(chainId, new ethers.providers.StaticJsonRpcProvider({
      url: getRpcUrl(chainId),
      headers: RPC_HEADERS
    }, chainId))
  }
  return providersMap.get(chainId) as ethers.providers.StaticJsonRpcProvider
}

const validatorMap = new Map<number, OrderValidator>()
export function getValidator(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
  if (!validatorMap.get(chainId)) {
    validatorMap.set(chainId, new OrderValidator(provider, chainId))
  }
  return validatorMap.get(chainId) as OrderValidator
}

/*
 * Minimum wait between Step Functions retries. Wait state granularity is
 * whole seconds, so any sub-second block time would round to zero and
 * hot-loop the state machine. Floor is one second — Step Functions' minimum
 * representable wait.
 */
export const MIN_RETRY_WAIT_SECONDS = 1

/*
 * In the first hour of order submission, we check the order status roughly every block.
 * We then do exponential backoff on the wait time until the interval reaches roughly 6 hours.
 * All subsequent retries are at 6 hour intervals.
 */
export function calculateDutchRetryWaitSeconds(chainId: ChainId, retryCount: number): number {
  const calculated =
    retryCount <= 300
      ? AVERAGE_BLOCK_TIME(chainId)
      : retryCount <= 450
      ? Math.ceil(AVERAGE_BLOCK_TIME(chainId) * Math.pow(1.05, retryCount - 300))
      : 18000
  return Math.max(MIN_RETRY_WAIT_SECONDS, calculated)
}

export type RetryWaitContext = {
  orderStatus: ORDER_STATUS
  getFillLogAttempts?: number
  createdAt?: number
  nowSeconds: number
}

/*
 * Limit orders live up to a year, so polling each one every block for its whole life
 * costs Step Functions transitions in proportion to open orders x blocks. Poll every
 * block while the order is young (when quick fills land) and while a nonce-used or
 * expired grace poll is pending (so cancellations settle quickly), then slow down.
 * Orders without funds cannot be filled until the swapper tops up, so they are
 * polled least often.
 */
export const LIMIT_ORDER_BLOCK_CADENCE_AGE_SECONDS = 10 * 60
export const LIMIT_ORDER_OPEN_POLL_SECONDS = 30
export const LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS = 300

export function calculateLimitRetryWaitSeconds(
  chainId: ChainId,
  _retryCount: number,
  context: RetryWaitContext
): number {
  const blockCadence = Math.max(MIN_RETRY_WAIT_SECONDS, Math.ceil(AVERAGE_BLOCK_TIME(chainId)))
  if (context.getFillLogAttempts) {
    return blockCadence
  }
  if (context.orderStatus === ORDER_STATUS.INSUFFICIENT_FUNDS) {
    return Math.max(blockCadence, LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS)
  }
  if (context.createdAt !== undefined && context.nowSeconds - context.createdAt < LIMIT_ORDER_BLOCK_CADENCE_AGE_SECONDS) {
    return blockCadence
  }
  return Math.max(blockCadence, LIMIT_ORDER_OPEN_POLL_SECONDS)
}

/*
 * A limit-order run that starts without a fill-search window (the first run, and every
 * restart -- see the handler) searches back from its first poll. A restart is kicked
 * off from the previous run's final poll, so the new run can see a nonce consumed by a
 * fill that landed up to one poll interval before that. The lookback must cover the
 * longest limit-order interval, or the new run misses the fill and records the used
 * nonce as a cancellation.
 */
export const LIMIT_FILL_EVENT_LOOKBACK_BLOCKS = (chainId: ChainId): number =>
  FILL_EVENT_LOOKBACK_BLOCKS_ON(chainId) +
  Math.ceil(LIMIT_ORDER_INSUFFICIENT_FUNDS_POLL_SECONDS / AVERAGE_BLOCK_TIME(chainId))
