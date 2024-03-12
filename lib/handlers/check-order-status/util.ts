import {
  DutchOrder,
  EventWatcher,
  FillInfo,
  OrderType,
  OrderValidator,
  REACTOR_ADDRESS_MAPPING,
} from '@uniswap/uniswapx-sdk'

import { ethers } from 'ethers'
import { ORDER_STATUS, SettledAmount } from '../../entities'
import { log } from '../../Logging'
import { ChainId } from '../../util/chain'
import { NATIVE_ADDRESS } from '../../util/constants'

export function logFillInfo(
  fill: FillInfo,
  quoteId: string | undefined,
  timestamp: number,
  gasCostInETH: string,
  gasPriceWei: string,
  gasUsed: string,
  userAmount: SettledAmount
): void {
  log.info('Fill Info', {
    orderInfo: {
      orderStatus: ORDER_STATUS.FILLED,
      orderHash: fill.orderHash,
      quoteId: quoteId,
      filler: fill.filler,
      nonce: fill.nonce.toString(),
      offerer: fill.swapper,
      tokenIn: userAmount.tokenIn,
      amountIn: userAmount.amountIn,
      tokenOut: userAmount.tokenOut,
      amountOut: userAmount.amountOut,
      blockNumber: fill.blockNumber,
      txHash: fill.txHash,
      fillTimestamp: timestamp,
      gasPriceWei: gasPriceWei,
      gasUsed: gasUsed,
      gasCostInETH: gasCostInETH,
      logTime: Math.floor(Date.now() / 1000).toString(),
    },
  })
}

/**
 * get the ammounts transfered on chain
 * used for logging
 */
export function getSettledAmounts(fill: FillInfo, fillTimestamp: number, parsedOrder: DutchOrder): SettledAmount[] {
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

export const AVERAGE_BLOCK_TIME = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 12
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

//10 minute lookback
export const LIMIT_ORDERS_FILL_EVENT_LOOKBACK_BLOCKS_ON = (chainId: ChainId): number => {
  switch (chainId) {
    case ChainId.MAINNET:
      return 50
    case ChainId.POLYGON:
      return 300
    default:
      return 50
  }
}

const watcherMap = new Map<number, EventWatcher>()
export function getWatcher(provider: ethers.providers.StaticJsonRpcProvider, chainId: number) {
  if (!REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch]) {
    throw new Error(`No Reactor Address Defined in UniswapX SDK for chainId:${chainId}, orderType${OrderType.Dutch}`)
  }
  if (!watcherMap.get(chainId)) {
    watcherMap.set(chainId, new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch] as string))
  }
  return watcherMap.get(chainId) as EventWatcher
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
