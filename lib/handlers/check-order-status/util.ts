import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  DutchOrder,
  FillInfo,
  OrderType,
  OrderValidator,
  REACTOR_ADDRESS_MAPPING,
  RelayOrder,
  UniswapXEventWatcher,
} from '@uniswap/uniswapx-sdk'

import { BigNumber, ethers } from 'ethers'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { ChainId } from '../../util/chain'
import { NATIVE_ADDRESS } from '../../util/constants'

export interface FillMetadata {
  timestamp: number
  gasPrice?: BigNumber
  maxPriorityFeePerGas?: BigNumber
  maxFeePerGas?: BigNumber
}

export function getSettledAmounts(
  fill: FillInfo,
  metadata: FillMetadata,
  parsedOrder: DutchOrder | CosignedV2DutchOrder | CosignedPriorityOrder
) {
  if (parsedOrder instanceof DutchOrder || parsedOrder instanceof CosignedV2DutchOrder) {
    return getDutchSettledAmounts(fill, metadata.timestamp, parsedOrder)
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

export function getRelaySettledAmounts(fill: FillInfo, parsedOrder: RelayOrder): SettledAmount[] {
  const amountIn = parsedOrder.info.input.amount.toString()
  const settledAmounts: SettledAmount[] = fill.outputs.map((output) => {
    return {
      tokenIn: parsedOrder.info.input.token,
      amountIn,
      tokenOut: output.token,
      amountOut: output.amount.toString(),
    }
  })
  return settledAmounts
}

export const AVERAGE_BLOCK_TIME = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 12
    case ChainId.ARBITRUM_ONE:
      return 1
    case ChainId.POLYGON:
      // Keep this at the default 12 for now since we would have to do more retries
      // if it was at 2 seconds
      return 12
    default:
      return 12
  }
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

const watcherMap = new Map<string, UniswapXEventWatcher>()
export function getWatcher(
  provider: ethers.providers.StaticJsonRpcProvider,
  chainId: number,
  orderType: OrderType
): UniswapXEventWatcher {
  const reactorType = orderType === OrderType.Limit ? OrderType.Dutch : orderType
  const address = REACTOR_ADDRESS_MAPPING[chainId][reactorType]
  if (!address) {
    throw new Error(`No Reactor Address Defined in UniswapX SDK for chainId:${chainId}, orderType:${reactorType}`)
  }
  const mapKey = `${chainId}-${reactorType}`
  let watcher = watcherMap.get(mapKey)
  if (!watcher) {
    watcher = new UniswapXEventWatcher(provider, address)
    watcherMap.set(mapKey, watcher)
  }
  return watcher
}

const providersMap = new Map<number, ethers.providers.StaticJsonRpcProvider>()
export function getProvider(chainId: number): ethers.providers.StaticJsonRpcProvider {
  const rpcURL = process.env[`RPC_${chainId}`]
  if (!rpcURL) {
    throw new Error(`rpcURL not defined for ${chainId}`)
  }
  if (!providersMap.get(chainId)) {
    providersMap.set(chainId, new ethers.providers.StaticJsonRpcProvider(rpcURL, chainId))
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
 * In the first hour of order submission, we check the order status roughly every block.
 * We then do exponential backoff on the wait time until the interval reaches roughly 6 hours.
 * All subsequent retries are at 6 hour intervals.
 */
export function calculateDutchRetryWaitSeconds(chainId: ChainId, retryCount: number): number {
  return retryCount <= 300
    ? AVERAGE_BLOCK_TIME(chainId)
    : retryCount <= 450
    ? Math.ceil(AVERAGE_BLOCK_TIME(chainId) * Math.pow(1.05, retryCount - 300))
    : 18000
}
