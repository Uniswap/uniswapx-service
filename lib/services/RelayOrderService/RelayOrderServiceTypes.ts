import { ethers } from 'ethers'
import { RelayOrderEntity } from '../../entities'

export type StatusBlocks = {
  fromBlock: number
  curBlockNumber: number
  startingBlockNumber: number
}

export type CheckFillEventsRequest = {
  orderHash: string
  order: RelayOrderEntity
  provider: ethers.providers.StaticJsonRpcProvider
  blocks: StatusBlocks
}
