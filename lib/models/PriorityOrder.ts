import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { getAverageBlockTimeSecs } from '@uniswap/sdk-core'
import { KmsSigner } from '@uniswap/signer'
import { CosignedPriorityOrder as SDKPriorityOrder, OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { OrderValidationFailedError } from '../errors/OrderValidationFailedError'
import { PRIORITY_ORDER_TARGET_BLOCK_BUFFER } from '../handlers/constants'
import { Order } from './Order'
import { ChainId } from '../util/chain'

export class PriorityOrder extends Order {
  constructor(
    readonly inner: SDKPriorityOrder,
    readonly signature: string,
    readonly chainId: number,
    readonly quoteId?: string,
    readonly requestId?: string
  ) {
    super()
  }

  get orderType(): OrderType {
    return OrderType.Priority
  }

  public async reparameterizeAndCosign(provider: StaticJsonRpcProvider, cosigner: KmsSigner): Promise<this> {
    const buffer = PRIORITY_ORDER_TARGET_BLOCK_BUFFER[this.chainId as ChainId]
    if (buffer === undefined) {
      throw new OrderValidationFailedError(`Priority orders are not supported on chainId ${this.chainId}`)
    }
    const block = await provider.getBlock("latest")
    const currentTime = Math.floor(Date.now() / 1000) // Current time in seconds
    
    // Calculate if we need to add an extra block based on timestamp difference
    // This keeps the time window more consistent for fillers
    const blockTimeSeconds = getAverageBlockTimeSecs(this.chainId as ChainId)
    const timeDifference = Math.abs(currentTime - block.timestamp)
    
    // If the difference is more than 75% of the block time, add an extra block
    const extraBlock = timeDifference > blockTimeSeconds * 0.75 ? 1 : 0

    this.inner.info.cosignerData = {
      auctionTargetBlock: BigNumber.from(block.number).add(buffer).add(extraBlock),
    }

    this.inner.info.cosignature = await cosigner.signDigest(this.inner.cosignatureHash(this.inner.info.cosignerData))
    return this
  }
}
