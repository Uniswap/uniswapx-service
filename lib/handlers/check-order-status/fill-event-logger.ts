import { FillInfo, OrderType } from '@uniswap/uniswapx-sdk'
import { Unit } from 'aws-embedded-metrics'
import { BigNumber, ethers } from 'ethers'
import {
  DutchV1OrderEntity,
  DutchV2OrderEntity,
  RelayOrderEntity,
  SettledAmount,
  UniswapXOrderEntity,
} from '../../entities'
import { AnalyticsService } from '../../services/analytics-service'
import { ChainId } from '../../util/chain'
import { metrics } from '../../util/metrics'
import { log } from '../../util/log'

export type ProcessFillEventRequest = {
  fillEvent: FillInfo
  order: UniswapXOrderEntity | RelayOrderEntity
  chainId: number
  startingBlockNumber: number
  settledAmounts: SettledAmount[]
  quoteId?: string
  tx?: ethers.providers.TransactionResponse
  block?: ethers.providers.Block
  fillTimeBlocks?: number
  timestamp: number
}
export class FillEventLogger {
  constructor(
    private fillEventBlockLookback: (chainId: ChainId) => number,
    private analyticsService: AnalyticsService
  ) {}

  public async processFillEvent({
    fillEvent,
    quoteId,
    order,
    chainId,
    startingBlockNumber,
    settledAmounts,
    tx,
    block,
    fillTimeBlocks,
    timestamp,
  }: ProcessFillEventRequest): Promise<SettledAmount[]> {
    if (tx && block) {
      const receipt = await tx.wait()
      const gasCostInETH = ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed))

      let filteredOutputs = settledAmounts
      if (order.type != OrderType.Relay) {
        filteredOutputs = settledAmounts.filter(amount => amount.tokenOut == order.outputs[0].token)
      }
      if (filteredOutputs.length > 0) {
        this.analyticsService.logFillInfo(
          fillEvent,
          order,
          quoteId,
          timestamp,
          gasCostInETH,
          receipt.effectiveGasPrice.toString(),
          receipt.gasUsed.toString(),
          receipt.effectiveGasPrice.sub(block.baseFeePerGas ?? 0).toString(),
          fillTimeBlocks ?? -1, // -1 means we don't have a fill time in blocks
          filteredOutputs.reduce((prev, cur) => (prev && BigNumber.from(prev.amountOut).gt(cur.amountOut) ? prev : cur))
        )
      } else {
        log.error('no matching settled amounts found for fill event', { fillEvent })
      }

      if (order.type === OrderType.Dutch || order.type === OrderType.Dutch_V2) {
        const percentDecayed = this.calculatePercentDecayed(order, timestamp)
        metrics.putMetric(`OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, percentDecayed, Unit.Percent)
      }

      // blocks until fill is the number of blocks between the fill event and the starting block number (need to add back the look back blocks)
      if (startingBlockNumber != 0) {
        const blocksUntilFill = fillEvent.blockNumber - (startingBlockNumber + this.fillEventBlockLookback(chainId))
        metrics.putMetric(`OrderSfn-BlocksUntilFill-chain-${chainId}`, blocksUntilFill, Unit.Count)
      }
      return settledAmounts
    } else {
      return []
    }
  }

  private calculatePercentDecayed(order: DutchV1OrderEntity | DutchV2OrderEntity, timestamp: number): number {
    if (order.decayStartTime && order.decayEndTime) {
      return (timestamp - order.decayStartTime) / (order.decayEndTime - order.decayStartTime)
    } else return 0
  }
}
