import { getAverageBlockTimeSecs as getSdkAverageBlockTimeSecs } from '@uniswap/sdk-core'
import { ChainId } from './chain'

// Chains whose block cadence has moved ahead of sdk-core's table. Base: the Denim
// upgrade replaces 2 s blocks with 200 ms blocks
// (https://docs.base.org/upgrades/denim/overview). Delete an entry once sdk-core
// publishes the new value and this repo pins that release.
const BLOCK_TIME_SECONDS_OVERRIDES: ReadonlyMap<number, number> = new Map([[ChainId.BASE, 0.2]])

// The override above when one exists, else sdk-core's value. Throws for chains
// sdk-core has not registered, as sdk-core does.
export function getAverageBlockTimeSecs(chainId: ChainId): number {
  return BLOCK_TIME_SECONDS_OVERRIDES.get(chainId) ?? getSdkAverageBlockTimeSecs(chainId)
}
