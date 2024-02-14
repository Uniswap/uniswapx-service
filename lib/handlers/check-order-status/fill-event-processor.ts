import { DutchOrder, FillInfo } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { BigNumber, ethers } from 'ethers'
import { OrderEntity, SettledAmount } from '../../entities'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { getSettledAmounts, logFillInfo } from './util'

export type ProcessFillEventRequest = {
  fillEvent: FillInfo
  provider: ethers.providers.StaticJsonRpcProvider
  parsedOrder: DutchOrder
  order: OrderEntity
  chainId: number
  startingBlockNumber: number
  quoteId?: string
}
export class FillEventProcessor {
  constructor(private fillEventBlockLookback: (chainId: ChainId) => number) {}
  public async processFillEvent({
    provider,
    fillEvent,
    parsedOrder,
    quoteId,
    order,
    chainId,
    startingBlockNumber,
  }: ProcessFillEventRequest): Promise<SettledAmount[]> {
    const [tx, block] = await Promise.all([
      provider.getTransaction(fillEvent.txHash),
      provider.getBlock(fillEvent.blockNumber),
    ])

    const timestamp = block.timestamp
    const receipt = await tx.wait()
    const gasCostInETH = ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed))
    const settledAmounts = getSettledAmounts(fillEvent, timestamp, parsedOrder)

    logFillInfo(
      fillEvent,
      quoteId,
      timestamp,
      gasCostInETH,
      receipt.effectiveGasPrice.toString(),
      receipt.gasUsed.toString(),
      settledAmounts.reduce((prev, cur) => (prev && BigNumber.from(prev.amountOut).gt(cur.amountOut) ? prev : cur))
    )

    const percentDecayed =
      order.decayEndTime === order.decayStartTime
        ? 0
        : (timestamp - order.decayStartTime) / (order.decayEndTime - order.decayStartTime)
    metrics.putMetric(`OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, percentDecayed, Unit.Percent)

    // blocks until fill is the number of blocks between the fill event and the starting block number (need to add back the look back blocks)
    const blocksUntilFill = fillEvent.blockNumber - (startingBlockNumber + this.fillEventBlockLookback(chainId))
    metrics.putMetric(`OrderSfn-BlocksUntilFill-chain-${chainId}`, blocksUntilFill, Unit.Count)
    return settledAmounts
  }
}
